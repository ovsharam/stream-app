import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { KbEntity } from '../../shared/personal-kb'
import type {
  KbOntologyConfig,
  OntologyAnchor,
  OntologyExtractRule,
  OntologyRelationType
} from '../../shared/kb-ontology'
import { DEFAULT_ONTOLOGY } from '../../shared/kb-ontology'
import { linkEntities, upsertEntity } from './store'

export type ExtractContext = {
  dealHint?: string
  meetingTitle?: string
  senderName?: string
  senderHandle?: string
  sessionId?: string
  datapointId?: string
}

export type OntologyExtractResult = {
  entities: KbEntity[]
  relations: { fromId: string; toId: string; type: string; weight: number }[]
}

let cached: KbOntologyConfig | null = null

function repoOntologyPath(): string {
  return join(process.cwd(), 'config/kb-ontology.json')
}

function userOntologyPath(): string {
  const dir = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  return join(dir, 'kb-ontology.json')
}

export function ontologyPath(): string {
  const user = userOntologyPath()
  if (existsSync(user)) return user
  return repoOntologyPath()
}

export function loadOntology(force = false): KbOntologyConfig {
  if (cached && !force) return cached

  const paths = [userOntologyPath(), repoOntologyPath()]
  for (const p of paths) {
    if (!existsSync(p)) continue
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8')) as KbOntologyConfig
      if (parsed.version === 1 && Array.isArray(parsed.entityTypes)) {
        cached = parsed
        return cached
      }
    } catch (e) {
      console.warn('[kb] ontology parse failed:', p, (e as Error).message)
    }
  }

  cached = DEFAULT_ONTOLOGY
  return cached
}

export function saveOntology(config: KbOntologyConfig): KbOntologyConfig {
  const dir = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  mkdirSync(dir, { recursive: true })
  const path = userOntologyPath()
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
  cached = config
  return config
}

export function getRelationType(id: string): OntologyRelationType | undefined {
  return loadOntology().relationTypes.find((r) => r.id === id)
}

function mapsToKind(typeId: string): KbEntity['kind'] {
  const t = loadOntology().entityTypes.find((e) => e.id === typeId)
  return t?.mapsTo ?? 'concept'
}

export function upsertOntologyEntity(typeId: string, label: string): KbEntity {
  return upsertEntity({
    kind: mapsToKind(typeId),
    label,
    ontologyType: typeId
  })
}

function resolveAnchor(
  anchor: OntologyAnchor,
  ctx: ExtractContext,
  extracted: KbEntity[]
): KbEntity | undefined {
  switch (anchor) {
    case 'deal':
      if (ctx.dealHint) return upsertOntologyEntity('deal', ctx.dealHint)
      return extracted.find((e) => e.ontologyType === 'deal' || e.ontologyType === 'customer')
    case 'meeting':
      if (ctx.meetingTitle) return upsertOntologyEntity('meeting', ctx.meetingTitle)
      if (ctx.sessionId) return upsertOntologyEntity('meeting', ctx.meetingTitle ?? `Meeting ${ctx.sessionId.slice(5, 12)}`)
      return extracted.find((e) => e.ontologyType === 'meeting')
    case 'company':
    case 'customer':
      if (ctx.dealHint) return upsertOntologyEntity('customer', ctx.dealHint)
      return extracted.find((e) => e.ontologyType === 'customer')
    case 'sender':
      if (ctx.senderName) return upsertOntologyEntity('stakeholder', ctx.senderName)
      if (ctx.senderHandle) return upsertOntologyEntity('stakeholder', ctx.senderHandle)
      return undefined
    case 'session':
      if (ctx.sessionId) return upsertOntologyEntity('meeting', ctx.meetingTitle ?? ctx.sessionId)
      return undefined
    case 'datapoint':
      return undefined
    default:
      return undefined
  }
}

function ruleRegex(rule: OntologyExtractRule): RegExp {
  const flags = rule.flags ?? 'gi'
  const withGlobal = flags.includes('g') ? flags : `${flags}g`
  return new RegExp(rule.pattern, withGlobal)
}

function applyRule(rule: OntologyExtractRule, text: string, ctx: ExtractContext): OntologyExtractResult {
  const entities: KbEntity[] = []
  const relations: OntologyExtractResult['relations'] = []
  const re = ruleRegex(rule)
  const matches = [...text.matchAll(re)]
  if (matches.length === 0) return { entities, relations }

  for (const m of matches) {
    const label = (rule.label ?? m[1] ?? m[0]).trim()
    if (label.length < 2) continue
    const ent = upsertOntologyEntity(rule.entityType, label)
    if (!entities.some((e) => e.id === ent.id)) entities.push(ent)

    if (rule.relation) {
      const anchor = resolveAnchor(rule.relation.anchor, ctx, entities)
      if (anchor && anchor.id !== ent.id) {
        const rel = getRelationType(rule.relation.type)
        relations.push({
          fromId: anchor.id,
          toId: ent.id,
          type: rule.relation.type,
          weight: rel?.weight ?? 1
        })
      }
    }
  }

  return { entities, relations }
}

function applyCoOccurrence(entities: KbEntity[]): OntologyExtractResult['relations'] {
  const relations: OntologyExtractResult['relations'] = []
  const rules = loadOntology().coOccurrence ?? []

  for (const rule of rules) {
    const [typeA, typeB] = rule.types
    const aList = entities.filter((e) => e.ontologyType === typeA)
    const bList = entities.filter((e) => e.ontologyType === typeB)
    for (const a of aList) {
      for (const b of bList) {
        if (a.id === b.id) continue
        relations.push({
          fromId: a.id,
          toId: b.id,
          type: rule.relation,
          weight: rule.weight ?? 0.8
        })
      }
    }
  }

  return relations
}

/** Run ontology extract rules + co-occurrence on text; returns typed entities and semantic edges. */
export function extractWithOntology(text: string, ctx: ExtractContext = {}): OntologyExtractResult {
  const ontology = loadOntology()
  const entities: KbEntity[] = []
  const relations: OntologyExtractResult['relations'] = []
  const seenEnt = new Set<string>()

  for (const rule of ontology.extractRules) {
    const result = applyRule(rule, text, ctx)
    for (const e of result.entities) {
      if (!seenEnt.has(e.id)) {
        seenEnt.add(e.id)
        entities.push(e)
      }
    }
    relations.push(...result.relations)
  }

  relations.push(...applyCoOccurrence(entities))

  return { entities, relations }
}

export function applyOntologyRelations(
  relations: OntologyExtractResult['relations']
): void {
  for (const r of relations) {
    linkEntities(r.fromId, r.toId, r.type, r.weight)
    const rel = getRelationType(r.type)
    if (rel?.symmetric) {
      linkEntities(r.toId, r.fromId, r.type, r.weight)
    }
  }
}

export function linkDatapointOntology(
  datapointId: string,
  text: string,
  ctx: ExtractContext
): KbEntity[] {
  const { entities, relations } = extractWithOntology(text, ctx)
  for (const ent of entities) {
    linkEntities(datapointId, ent.id, 'mentions', 1)
  }
  applyOntologyRelations(relations)
  return entities
}
