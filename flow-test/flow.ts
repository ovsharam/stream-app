#!/usr/bin/env tsx
/**
 * Notch FDE flow test — prove intake → score → build → execute → email.
 * NOT a product. Run: npm run flow:sample  (from flow-test/)
 */
import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { config } from 'dotenv'
import { createInterface } from 'readline'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'

const __dir = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dir, '..', '.env') })
config({ path: join(__dir, '.env') })

const CONTEXT_GATE = 60
const BUILD_OUTPUT = join(__dir, 'build-output')
const RUN_LOG = join(__dir, 'run-log.json')

const modelId = process.env.FLOW_MODEL?.trim() || 'claude-sonnet-4-6'

function model() {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) {
    console.error('\n❌ Set ANTHROPIC_API_KEY in repo root .env or flow-test/.env\n')
    process.exit(1)
  }
  return anthropic(modelId)
}

const requirementSchema = z.object({
  text: z.string(),
  status: z.enum(['open', 'confirmed', 'ambiguous'])
})

const extractSchema = z.object({
  client: z.string(),
  title: z.string(),
  requirements: z.array(requirementSchema).min(1)
})

const scoreSchema = z.object({
  contextScore: z.number().min(0).max(100),
  gaps: z.array(z.string()),
  needsAeSync: z.boolean(),
  reasoning: z.string()
})

const buildStepSchema = z.object({
  order: z.number().int().positive(),
  action: z.string(),
  gotcha: z.string().optional()
})

const buildPromptSchema = z.object({
  steps: z.array(buildStepSchema).min(1),
  summary: z.string(),
  blockedNote: z.string().optional()
})

const executeSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      content: z.string()
    })
  ),
  log: z.array(z.string())
})

const emailSchema = z.object({
  subject: z.string(),
  body: z.string()
})

export type Extracted = z.infer<typeof extractSchema>
export type ScoreResult = z.infer<typeof scoreSchema>
export type BuildPlan = z.infer<typeof buildPromptSchema>
export type ExecuteResult = z.infer<typeof executeSchema>
export type EmailDraft = z.infer<typeof emailSchema>

type StageLog = {
  stage: string
  ms: number
  input: unknown
  output: unknown
}

function hr(label: string) {
  console.log(`\n${'─'.repeat(72)}\n  ${label}\n${'─'.repeat(72)}`)
}

function printJson(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2))
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>()
  const positional: string[] = []
  for (const arg of argv) {
    if (arg.startsWith('--')) flags.add(arg)
    else positional.push(arg)
  }
  return {
    intakePath: positional[0],
    demo: flags.has('--demo'),
    fast: flags.has('--fast'),
    quiet: flags.has('--quiet')
  }
}

async function demoPause(stage: string, hint: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  await new Promise<void>((resolve) => {
    rl.question(`\n▶ ${stage} — ${hint}\n   Press Enter to continue… `, () => {
      rl.close()
      resolve()
    })
  })
}

function printDemoBeat(label: string, lines: string[]) {
  console.log(`\n┌─ ${label}`)
  for (const line of lines) console.log(`│  ${line}`)
  console.log('└─')
}

async function timed<T>(
  label: string,
  input: unknown,
  fn: () => Promise<T>,
  opts?: { demo?: boolean; quiet?: boolean }
): Promise<{ out: T; ms: number }> {
  const t0 = Date.now()
  if (!opts?.quiet) {
    hr(label)
    if (!opts?.demo) {
      console.log('INPUT (preview):')
      const preview =
        typeof input === 'string'
          ? input.slice(0, 400) + (input.length > 400 ? '…' : '')
          : JSON.stringify(input, null, 2).slice(0, 800)
      console.log(preview)
    }
  }
  const out = await fn()
  const ms = Date.now() - t0
  if (!opts?.quiet) {
    if (opts?.demo) console.log(`✓ ${label} (${(ms / 1000).toFixed(1)}s)`)
    else {
      console.log(`\nOUTPUT (${ms}ms):`)
      printJson(out)
    }
  }
  return { out, ms }
}

async function extract(rawText: string): Promise<Extracted> {
  const { object } = await generateObject({
    model: model(),
    schema: extractSchema,
    system: `You parse raw FDE intake (discovery call transcript or email thread) into structured scope.
Rules:
- Do NOT invent requirements not supported by the text.
- Mark requirements as "confirmed" only when explicitly agreed; "ambiguous" when vague (latency, OAuth scopes, etc.); "open" otherwise.
- client = company name; title = short engagement name.`,
    prompt: rawText
  })
  return object
}

async function score(extracted: Extracted): Promise<ScoreResult> {
  const { object } = await generateObject({
    model: model(),
    schema: scoreSchema,
    system: `You judge how build-ready an FDE engagement scope is (0-100).
- contextScore < ${CONTEXT_GATE} means NOT ready to full-build — list specific gaps.
- needsAeSync = true when AE/sales must clarify commercial, security, or buyer-side unknowns before engineering commits.
- Penalize vague latency targets, unconfirmed OAuth/scopes, missing admin contacts, data residency unknowns.
- Be strict. Do not rubber-stamp high scores.`,
    prompt: JSON.stringify(extracted, null, 2)
  })
  return object
}

async function buildPrompt(extracted: Extracted, scoreResult: ScoreResult): Promise<BuildPlan> {
  const gated = scoreResult.contextScore < CONTEXT_GATE
  const { object } = await generateObject({
    model: model(),
    schema: buildPromptSchema,
    system: `You produce an ORDERED build plan for a coding agent (Claude Code / Cursor).
- Include real gotchas (OAuth order, EU data residency, Salesforce API limits) — no generic filler.
${
  gated
    ? `- Context score is ${scoreResult.contextScore} (below ${CONTEXT_GATE}). Plan ONLY what is safe to prototype now. Set blockedNote listing what is blocked until gaps close.`
    : '- Full build plan is allowed.'
}`,
    prompt: JSON.stringify({ extracted, score: scoreResult }, null, 2)
  })
  return object
}

async function execute(plan: BuildPlan, client: string): Promise<ExecuteResult> {
  const { object } = await generateObject({
    model: model(),
    schema: executeSchema,
    system: `Generate actual code/config files for the build plan. Keep files small but real.
- paths relative to project root (e.g. src/integrations/salesforce-lookup.ts)
- log[] = human-readable steps you took
TODO for production: shell out to Claude Code CLI instead of generating inline.`,
    prompt: `Client: ${client}\n\nBuild plan:\n${JSON.stringify(plan, null, 2)}`
  })

  mkdirSync(BUILD_OUTPUT, { recursive: true })
  for (const file of object.files) {
    const dest = join(BUILD_OUTPUT, file.path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, file.content, 'utf-8')
  }
  return {
    filesWritten: object.files.map((f) => f.path),
    log: object.log
  }
}

async function draftEmail(
  client: string,
  extracted: Extracted,
  scoreResult: ScoreResult,
  exec: { filesWritten: string[]; log: string[] }
): Promise<EmailDraft> {
  const { object } = await generateObject({
    model: model(),
    schema: emailSchema,
    system: `Write a client-facing email a sharp FDE would send after a discovery sprint.
- Professional, concise, no robot voice.
- State what we built/prototyped, what we still need (gaps), clear next steps.
- If context score is low, be honest about what's blocked.`,
    prompt: JSON.stringify({ client, extracted, score: scoreResult, execute: exec }, null, 2)
  })
  return object
}

function printChecklist(scoreResult: ScoreResult, extracted: Extracted) {
  hr('PASS / FAIL CHECKLIST (judge manually)')
  console.log(`
  [ ] EXTRACT — client/title/requirements match intake (no inventions)
  [ ] SCORE — caught vague latency / OAuth / EU gaps (score=${scoreResult.contextScore}, needsAeSync=${scoreResult.needsAeSync})
  [ ] GAPS — ${scoreResult.gaps.length} listed: ${scoreResult.gaps.slice(0, 3).join('; ') || '(none)'}
  [ ] BUILD — gotchas are specific to this deal
  [ ] EXECUTE — files in ./build-output/ are relevant
  [ ] EMAIL — you'd send with light edits

  → If 3+ solid: chain is real. Fix prompts, not UI.
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.intakePath) {
    console.error('Usage: npm run flow -- ./sample-intake.txt [--demo] [--fast]')
    console.error('  --demo   pause between stages (live presentation)')
    console.error('  --fast   skip EXECUTE (~3 min demo; use pre-built output for code tour)')
    process.exit(1)
  }

  const rawText = readFileSync(resolve(args.intakePath), 'utf-8')
  const stages: StageLog[] = []
  const t0 = Date.now()
  const timedOpts = { demo: args.demo, quiet: false }

  if (args.demo) {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗')
    console.log('║  NOTCH · live intake → deploy flow                               ║')
    console.log('╚══════════════════════════════════════════════════════════════════╝')
    console.log(`\nIntake: ${resolve(args.intakePath)}`)
    await demoPause('Setup', 'Paste messy transcript in → structured case out')
  } else {
    console.log(`\n🚀 Notch FDE flow test · model=${modelId}\n   intake: ${resolve(args.intakePath)}`)
  }

  if (args.demo) await demoPause('1 · EXTRACT', 'Watch requirements appear from the call')
  const e1 = await timed('1 · EXTRACT', rawText.slice(0, 200) + '…', () => extract(rawText), timedOpts)
  stages.push({ stage: 'extract', ms: e1.ms, input: { chars: rawText.length }, output: e1.out })
  if (args.demo) {
    printDemoBeat('Requirements extracted', [
      `Client: ${e1.out.client}`,
      `Title: ${e1.out.title}`,
      `${e1.out.requirements.length} rows · ${e1.out.requirements.filter((r) => r.status === 'ambiguous').length} ambiguous`
    ])
  }

  if (args.demo) await demoPause('2 · SCORE', 'Context gate — would we let eng build?')
  const e2 = await timed('2 · SCORE', e1.out, () => score(e1.out), timedOpts)
  stages.push({ stage: 'score', ms: e2.ms, input: e1.out, output: e2.out })
  if (args.demo) {
    printDemoBeat('Gap analysis', [
      `Context score: ${e2.out.contextScore}/100 (gate ${CONTEXT_GATE})`,
      `AE sync needed: ${e2.out.needsAeSync ? 'yes' : 'no'}`,
      ...e2.out.gaps.slice(0, 3).map((g) => `· ${g.slice(0, 72)}…`)
    ])
  }

  if (args.demo) await demoPause('3 · BUILD PROMPT', 'Agent-ready plan with real gotchas')
  const e3 = await timed('3 · BUILD PROMPT', e2.out, () => buildPrompt(e1.out, e2.out), timedOpts)
  stages.push({ stage: 'buildPrompt', ms: e3.ms, input: e2.out, output: e3.out })
  if (args.demo) {
    printDemoBeat('Build plan', [
      e3.out.summary.slice(0, 120) + '…',
      `${e3.out.steps.length} steps · first: ${e3.out.steps[0]?.action.slice(0, 60)}…`
    ])
  }

  let e4: { out: ExecuteResult; ms: number }
  if (args.fast) {
    if (args.demo) {
      await demoPause('4 · EXECUTE (skipped)', 'Open flow-test/build-output/ from a prior run')
    }
    e4 = {
      out: { filesWritten: [], log: ['EXECUTE skipped (--fast). Use prior build-output/ for code tour.'] },
      ms: 0
    }
    stages.push({ stage: 'execute', ms: 0, input: { skipped: true }, output: e4.out })
  } else {
    if (args.demo) await demoPause('4 · EXECUTE', 'Agents write code — ~2 min')
    e4 = await timed('4 · EXECUTE', e3.out, () => execute(e3.out, e1.out.client), timedOpts)
    stages.push({
      stage: 'execute',
      ms: e4.ms,
      input: e3.out,
      output: { filesWritten: e4.out.filesWritten, log: e4.out.log }
    })
    if (args.demo) {
      printDemoBeat('Code generated', [
        `${e4.out.filesWritten.length} files → flow-test/build-output/`,
        e4.out.filesWritten.slice(0, 4).join(', ') + (e4.out.filesWritten.length > 4 ? '…' : '')
      ])
    }
  }

  if (args.demo) await demoPause('5 · EMAIL', 'Client-facing recap — what we built + what we need')
  const e5 = await timed('5 · EMAIL', e1.out.client, () => draftEmail(e1.out.client, e1.out, e2.out, e4.out), timedOpts)
  stages.push({ stage: 'email', ms: e5.ms, input: e1.out.client, output: e5.out })

  const totalMs = Date.now() - t0

  hr('SUMMARY')
  console.log(`  Total time:     ${(totalMs / 1000).toFixed(1)}s`)
  console.log(`  Context score:  ${e2.out.contextScore}/100 (gate ${CONTEXT_GATE})`)
  console.log(`  Needs AE sync:  ${e2.out.needsAeSync}`)
  if (!args.fast) {
    console.log(`  Files written:  ${e4.out.filesWritten.length} → ${BUILD_OUTPUT}/`)
    e4.out.filesWritten.slice(0, 8).forEach((f) => console.log(`    · ${f}`))
    if (e4.out.filesWritten.length > 8) console.log(`    · … +${e4.out.filesWritten.length - 8} more`)
  }
  console.log(`\n  EMAIL SUBJECT: ${e5.out.subject}`)
  console.log(`\n${e5.out.body}`)

  writeFileSync(
    RUN_LOG,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        model: modelId,
        intakePath: resolve(args.intakePath),
        totalMs,
        stages,
        summary: {
          contextScore: e2.out.contextScore,
          needsAeSync: e2.out.needsAeSync,
          filesWritten: e4.out.filesWritten,
          emailSubject: e5.out.subject
        }
      },
      null,
      2
    ),
    'utf-8'
  )
  console.log(`\n  Full log → ${RUN_LOG}`)

  printChecklist(e2.out, e1.out)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
