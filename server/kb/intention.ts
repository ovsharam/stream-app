import type { IntentionKind, IntentionVector } from '../../shared/personal-kb'

const WEIGHTS: Record<IntentionKind, RegExp[]> = {
  explore: [
    /\b(wonder|what if|curious|research|learn|explore|why\b|how does)\b/i,
    /\?\s*$/
  ],
  plan: [
    /\b(plan|schedule|roadmap|priorit|next week|tomorrow|agenda|milestone)\b/i
  ],
  execute: [
    /\b(fix|ship|do|send|reply|create|move|implement|run|complete|finish|todo|need to)\b/i,
    /^@\w+/
  ],
  reflect: [
    /\b(learned|realized|insight|note|remember|takeaway|retrospective)\b/i
  ],
  defer: [/\b(later|someday|maybe|backlog|park|not now|eventually)\b/i]
}

export function inferIntention(text: string): IntentionVector {
  const scores: Record<IntentionKind, number> = {
    explore: 0.1,
    plan: 0.1,
    execute: 0.1,
    reflect: 0.1,
    defer: 0.1
  }

  for (const kind of Object.keys(WEIGHTS) as IntentionKind[]) {
    for (const re of WEIGHTS[kind]) {
      if (re.test(text)) scores[kind] += 0.35
    }
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1
  const normalized = Object.fromEntries(
    Object.entries(scores).map(([k, v]) => [k, v / total])
  ) as Record<IntentionKind, number>

  const dominant = (Object.entries(normalized).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'explore') as IntentionKind

  return {
    explore: normalized.explore,
    plan: normalized.plan,
    execute: normalized.execute,
    reflect: normalized.reflect,
    defer: normalized.defer,
    dominant
  }
}

export function blendIntention(a: IntentionVector, b: IntentionVector, w = 0.5): IntentionVector {
  const mix = (x: number, y: number) => x * (1 - w) + y * w
  const v: Omit<IntentionVector, 'dominant'> = {
    explore: mix(a.explore, b.explore),
    plan: mix(a.plan, b.plan),
    execute: mix(a.execute, b.execute),
    reflect: mix(a.reflect, b.reflect),
    defer: mix(a.defer, b.defer)
  }
  const dominant = (Object.entries(v).sort((x, y) => y[1] - x[1])[0]?.[0] ??
    'explore') as IntentionKind
  return { ...v, dominant }
}
