import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { z } from 'zod'
import type {
  FlowBuildPlan,
  FlowEmail,
  FlowExecute,
  FlowExtracted,
  FlowScore,
  FlowStageEvent
} from '../../shared/fde-flow'
import { CONTEXT_GATE } from '../../shared/fde-context'
import type { EngagementStage, FdeEngagement, ScopeBucket } from '../../shared/fde-engagement'
import { upsertEngagement } from './engagementStore'

const modelId = process.env.FLOW_MODEL?.trim() || 'claude-sonnet-4-6'

const extractSchema = z.object({
  client: z.string(),
  title: z.string(),
  requirements: z
    .array(
      z.object({
        text: z.string(),
        status: z.enum(['open', 'confirmed', 'ambiguous'])
      })
    )
    .min(1)
})

const scoreSchema = z.object({
  contextScore: z.number().min(0).max(100),
  gaps: z.array(z.string()),
  needsAeSync: z.boolean(),
  reasoning: z.string()
})

const buildPromptSchema = z.object({
  steps: z
    .array(
      z.object({
        order: z.number().int().positive(),
        action: z.string(),
        gotcha: z.string().optional()
      })
    )
    .min(1),
  summary: z.string(),
  blockedNote: z.string().optional()
})

const executeSchema = z.object({
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  log: z.array(z.string())
})

const emailSchema = z.object({
  subject: z.string(),
  body: z.string()
})

function flowModel() {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')
  return anthropic(modelId)
}

function flowOutputDir(engagementId: string): string {
  const base = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  return join(base, 'flow-runs', engagementId)
}

export function formatBuildPrompt(plan: FlowBuildPlan): string {
  const steps = plan.steps
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      let line = `${s.order}. ${s.action}`
      if (s.gotcha) line += `\n   Gotcha: ${s.gotcha}`
      return line
    })
    .join('\n\n')
  return `${plan.summary}\n\n## Build steps\n\n${steps}${plan.blockedNote ? `\n\n## Blocked until gaps close\n\n${plan.blockedNote}` : ''}`
}

async function extractIntake(rawText: string): Promise<FlowExtracted> {
  const { object } = await generateObject({
    model: flowModel(),
    schema: extractSchema,
    system: `You parse raw FDE intake (discovery call transcript or email thread) into structured scope.
Rules:
- Do NOT invent requirements not supported by the text.
- Mark requirements as "confirmed" only when explicitly agreed; "ambiguous" when vague; "open" otherwise.`,
    prompt: rawText
  })
  return object
}

async function scoreIntake(extracted: FlowExtracted): Promise<FlowScore> {
  const { object } = await generateObject({
    model: flowModel(),
    schema: scoreSchema,
    system: `You judge how build-ready an FDE engagement scope is (0-100).
- contextScore < ${CONTEXT_GATE} means NOT ready to full-build — list specific gaps.
- needsAeSync = true when AE/sales must clarify before engineering commits.
- Be strict. Do not rubber-stamp high scores.`,
    prompt: JSON.stringify(extracted, null, 2)
  })
  return object
}

async function planBuild(extracted: FlowExtracted, scoreResult: FlowScore): Promise<FlowBuildPlan> {
  const gated = scoreResult.contextScore < CONTEXT_GATE
  const { object } = await generateObject({
    model: flowModel(),
    schema: buildPromptSchema,
    system: `You produce an ORDERED build plan for a coding agent.
- Include real gotchas — no generic filler.
${
  gated
    ? `- Context score ${scoreResult.contextScore} is below ${CONTEXT_GATE}. Plan ONLY safe prototype work. Set blockedNote.`
    : '- Full build plan allowed.'
}`,
    prompt: JSON.stringify({ extracted, score: scoreResult }, null, 2)
  })
  return object
}

async function executePlan(plan: FlowBuildPlan, client: string, outDir: string): Promise<FlowExecute> {
  const { object } = await generateObject({
    model: flowModel(),
    schema: executeSchema,
    system: `Generate actual code/config files for the build plan. Keep files small but real.
- paths relative to project root
- log[] = steps taken`,
    prompt: `Client: ${client}\n\nBuild plan:\n${JSON.stringify(plan, null, 2)}`
  })

  mkdirSync(outDir, { recursive: true })
  for (const file of object.files) {
    const dest = join(outDir, file.path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, file.content, 'utf-8')
  }
  return { filesWritten: object.files.map((f) => f.path), log: object.log }
}

async function draftClientEmail(
  client: string,
  extracted: FlowExtracted,
  scoreResult: FlowScore,
  exec: FlowExecute
): Promise<FlowEmail> {
  const { object } = await generateObject({
    model: flowModel(),
    schema: emailSchema,
    system: `Write a client-facing email a sharp FDE would send after a discovery sprint.
Professional, concise. State what was built, gaps, next steps.`,
    prompt: JSON.stringify({ client, extracted, score: scoreResult, execute: exec }, null, 2)
  })
  return object
}

function inferScope(extracted: FlowExtracted, score: FlowScore): ScopeBucket {
  const ambiguous = extracted.requirements.filter((r) => r.status === 'ambiguous').length
  if (ambiguous >= 3 || score.contextScore < 40) return 'unknown'
  if (score.contextScore >= CONTEXT_GATE) return 'quick_win'
  return 'big_bet'
}

function inferStage(score: FlowScore): EngagementStage {
  if (score.contextScore >= CONTEXT_GATE) return 'build'
  return 'context'
}

export function applyFlowToEngagement(input: {
  extracted: FlowExtracted
  score: FlowScore
  plan: FlowBuildPlan
  exec: FlowExecute
  email: FlowEmail
  engagementId?: string
}): FdeEngagement {
  const flags = input.extracted.requirements
    .filter((r) => r.status === 'ambiguous')
    .map((r) => r.text.slice(0, 120))
  if (input.score.needsAeSync) flags.unshift('AE sync required before full build')

  return upsertEngagement({
    id: input.engagementId,
    clientName: input.extracted.client,
    stage: inferStage(input.score),
    scope: inferScope(input.extracted, input.score),
    summary: `${input.extracted.title}\n\n${input.plan.summary}`,
    buildPrompt: formatBuildPrompt(input.plan),
    nextSteps: [
      `Client email ready: ${input.email.subject}`,
      ...input.exec.filesWritten.slice(0, 5).map((f) => `Generated: ${f}`)
    ],
    flags,
    openQuestions: input.score.gaps,
    contextScore: input.score.contextScore,
    escalationLevel: input.score.needsAeSync ? 1 : 0,
    signalSources: ['meeting']
  })
}

export async function runFdeFlow(input: {
  intakeText: string
  skipExecute?: boolean
  engagementId?: string
  onEvent: (event: FlowStageEvent) => void
}): Promise<{ engagement: FdeEngagement; email: FlowEmail; filesWritten: string[]; totalMs: number }> {
  const t0 = Date.now()
  const emit = input.onEvent

  async function runStage<T>(stage: 'extract' | 'score' | 'build' | 'execute' | 'email', fn: () => Promise<T>): Promise<T> {
    emit({ stage, status: 'running' })
    const s0 = Date.now()
    const output = await fn()
    emit({ stage, status: 'done', ms: Date.now() - s0, output })
    return output
  }

  const extracted = await runStage('extract', () => extractIntake(input.intakeText))
  const scoreResult = await runStage('score', () => scoreIntake(extracted))
  const plan = await runStage('build', () => planBuild(extracted, scoreResult))

  const engagementId =
    input.engagementId ??
    upsertEngagement({
      clientName: extracted.client,
      stage: 'intake',
      scope: 'unknown',
      summary: extracted.title
    }).id

  let exec: FlowExecute = { filesWritten: [], log: ['Execute skipped for fast demo'] }
  if (!input.skipExecute) {
    exec = await runStage('execute', () =>
      executePlan(plan, extracted.client, flowOutputDir(engagementId))
    )
  }

  const email = await runStage('email', () => draftClientEmail(extracted.client, extracted, scoreResult, exec))

  const engagement = applyFlowToEngagement({
    extracted,
    score: scoreResult,
    plan,
    exec,
    email,
    engagementId
  })

  const totalMs = Date.now() - t0
  emit({
    stage: 'complete',
    engagementId: engagement.id,
    email,
    filesWritten: exec.filesWritten,
    totalMs
  })

  return { engagement, email, filesWritten: exec.filesWritten, totalMs }
}
