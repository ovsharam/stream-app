import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import './mind-graph.css'
import type { KbGraphLink, KbGraphNode, KbGraphSnapshot, KbGraphViewMode } from '@shared/kb-graph'
import { clusterApi } from '../lib/api'

type GraphNode = KbGraphNode & { x?: number; y?: number }
type GraphLink = KbGraphLink & { source: string | GraphNode; target: string | GraphNode }

const ONTOLOGY_COLORS: Record<string, string> = {
  customer: '#8e44ad',
  deal: '#e85d04',
  meeting: '#d35400',
  stakeholder: '#4a90d9',
  requirement: '#00897b',
  product_feature: '#1abc9c',
  blocker: '#c0392b',
  compliance_rule: '#9b59b6',
  integration: '#3498db',
  timeline: '#f39c12',
  budget_signal: '#27ae60'
}

const RELATION_COLORS: Record<string, string> = {
  has_requirement: '#00897b',
  requires_feature: '#1abc9c',
  blocked_by: '#e74c3c',
  subject_to: '#9b59b6',
  integrates_with: '#3498db',
  owned_by: '#4a90d9',
  part_of_deal: '#e85d04',
  targets_launch: '#f39c12',
  budget_for: '#27ae60',
  part_of: '#cc785c',
  relates_to: '#95a5a6',
  mentions: 'rgba(150, 160, 170, 0.45)'
}

const KIND_COLORS: Record<string, string> = {
  person: '#4a90d9',
  company: '#7c6fd6',
  project: '#e67e22',
  topic: '#27ae60',
  concept: '#16a085',
  term: '#95a5a6',
  integration_event: '#6b7280',
  consciousness: '#cc785c',
  action: '#0a66c2',
  note: '#8b7355',
  meeting_live: '#00897b',
  mobile_cluster: '#6366f1'
}

function nodeColor(node: KbGraphNode): string {
  if (node.kind === 'datapoint') return KIND_COLORS[node.type] ?? '#6b7280'
  if (node.ontologyType && ONTOLOGY_COLORS[node.ontologyType]) {
    return ONTOLOGY_COLORS[node.ontologyType]
  }
  return KIND_COLORS[node.type] ?? '#9ca3af'
}

function nodeRadius(node: KbGraphNode): number {
  if (node.kind === 'datapoint') return 3.5
  const mentions = node.mentionCount ?? 1
  if (node.ontologyType) return Math.min(16, 7 + Math.log2(mentions + 1) * 2)
  return Math.min(12, 5 + Math.log2(mentions + 1) * 2)
}

function linkColor(link: GraphLink, selected: KbGraphNode | null, hoverLink: GraphLink | null): string {
  if (hoverLink && link.id === hoverLink.id) return 'rgba(232, 165, 90, 0.95)'
  if (selected) {
    const sid = selected.id
    const src = typeof link.source === 'object' ? String((link.source as GraphNode).id) : String(link.source)
    const tgt = typeof link.target === 'object' ? String((link.target as GraphNode).id) : String(link.target)
    if (src === sid || tgt === sid) return RELATION_COLORS[link.relation] ?? 'rgba(250, 249, 245, 0.75)'
  }
  return RELATION_COLORS[link.relation] ?? 'rgba(250, 249, 245, 0.35)'
}

function linkWidth(link: GraphLink, hoverLink: GraphLink | null): number {
  if (hoverLink && link.id === hoverLink.id) return 2.8
  if (link.relation === 'mentions') return 0.4
  if (RELATION_COLORS[link.relation]) return 1.4 + Math.min(1.2, (link.weight ?? 1) * 0.5)
  return 0.8 + Math.min(1, (link.weight ?? 1) * 0.35)
}

function formatRelation(rel: string): string {
  return rel.replace(/_/g, ' ')
}

const VIEW_MODES: { id: KbGraphViewMode; label: string; hint: string }[] = [
  {
    id: 'structured',
    label: 'Deals & ontology',
    hint: 'Entity-to-entity relations (requirements, blockers, integrations) — what Graph RAG traverses.'
  },
  {
    id: 'memories',
    label: '+ Memories',
    hint: 'Adds memory nodes and mention links from feed, meetings, and integrations.'
  },
  {
    id: 'full',
    label: 'Full',
    hint: 'Broader slice including more raw terms — can look noisy.'
  }
]

export function MindGraphView() {
  const wrapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [snapshot, setSnapshot] = useState<KbGraphSnapshot | null>(null)
  const [viewMode, setViewMode] = useState<KbGraphViewMode>('structured')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<KbGraphNode | null>(null)
  const [hoverLink, setHoverLink] = useState<GraphLink | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await clusterApi.kbGraph({
        mode: viewMode,
        maxEntities: viewMode === 'structured' ? 220 : 400,
        maxDatapoints: viewMode === 'memories' ? 160 : viewMode === 'full' ? 120 : 0,
        maxEdges: viewMode === 'structured' ? 600 : 1200
      })
      setSnapshot(data)
      setSelected(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load graph')
    } finally {
      setLoading(false)
    }
  }, [viewMode])

  useEffect(() => {
    void load()
    const onMind = () => void load()
    window.addEventListener('notch:mind-updated', onMind)
    const interval = window.setInterval(() => void load(), 45_000)
    return () => {
      window.removeEventListener('notch:mind-updated', onMind)
      window.clearInterval(interval)
    }
  }, [load])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ w: Math.max(320, rect.width), h: Math.max(400, rect.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const graphData = useMemo(() => {
    if (!snapshot) return { nodes: [] as GraphNode[], links: [] as GraphLink[] }
    const q = query.trim().toLowerCase()
    const nodes = snapshot.nodes.filter((n) => {
      if (!q) return true
      return (
        n.label.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        (n.ontologyType?.toLowerCase().includes(q) ?? false) ||
        (n.source?.toLowerCase().includes(q) ?? false)
      )
    })
    const ids = new Set(nodes.map((n) => n.id))
    const links = snapshot.links.filter((l) => ids.has(l.source) && ids.has(l.target))
    return { nodes, links }
  }, [snapshot, query])

  const neighbors = useMemo(() => {
    if (!selected || !snapshot) return { in: [] as KbGraphLink[], out: [] as KbGraphLink[] }
    const inL = snapshot.links.filter((l) => l.target === selected.id)
    const outL = snapshot.links.filter((l) => l.source === selected.id)
    return { in: inL, out: outL }
  }, [selected, snapshot])

  const labelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of snapshot?.nodes ?? []) m.set(n.id, n.label)
    return m
  }, [snapshot])

  const legend = useMemo(() => {
    const items = new Map<string, string>()
    for (const n of graphData.nodes) {
      const key = n.ontologyType ?? (n.kind === 'datapoint' ? n.type : n.type)
      if (!items.has(key)) items.set(key, nodeColor(n))
    }
    return [...items.entries()].slice(0, 12)
  }, [graphData.nodes])

  const relationLegend = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of graphData.links) {
      counts.set(l.relation, (counts.get(l.relation) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([rel]) => rel)
  }, [graphData.links])

  const focusNode = (node: KbGraphNode) => {
    setSelected(node)
    const g = graphRef.current
    const hit = graphData.nodes.find((n) => n.id === node.id) as GraphNode | undefined
    if (g && hit?.x != null && hit?.y != null) {
      g.centerAt(hit.x, hit.y, 400)
      g.zoom(2.2, 400)
    }
  }

  const viewHint = VIEW_MODES.find((m) => m.id === viewMode)?.hint ?? ''
  const stats = snapshot?.stats

  return (
    <div className="x-mind-graph">
      <header className="x-mind-graph-head">
        <div>
          <p className="x-mind-graph-eyebrow">Personal KB · Graph RAG store</p>
          <h1 className="x-mind-graph-title">Knowledge graph</h1>
          <p className="x-mind-graph-sub">
            {stats
              ? `Showing ${graphData.nodes.length} nodes · ${graphData.links.length} relations`
              : 'Loading…'}
            {stats
              ? ` (${stats.viewedEntities ?? stats.entities} / ${stats.entities} entities · ${stats.viewedEdges ?? graphData.links.length} / ${stats.edges} edges in DB)`
              : ''}
            {stats?.ontologyEdges != null && viewMode === 'structured'
              ? ` · ${stats.ontologyEdges} deal/ontology links`
              : ''}
          </p>
          {viewHint ? <p className="x-mind-graph-hint">{viewHint}</p> : null}
        </div>
        <div className="x-mind-graph-actions">
          <div className="x-mind-graph-mode" role="tablist" aria-label="Graph view">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={viewMode === mode.id}
                className={`x-mind-graph-mode-btn${viewMode === mode.id ? ' active' : ''}`}
                onClick={() => setViewMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="x-mind-graph-search"
            placeholder="Filter nodes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter graph nodes"
          />
          <button type="button" className="x-mind-graph-btn" onClick={() => graphRef.current?.zoomToFit(400, 48)}>
            Fit
          </button>
          <button type="button" className="x-mind-graph-btn x-mind-graph-btn-primary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <p className="x-mind-graph-error">{error}</p> : null}

      <div className="x-mind-graph-body">
        <div className="x-mind-graph-canvas-wrap" ref={wrapRef}>
          {loading && !snapshot ? (
            <p className="x-mind-graph-loading">Building graph…</p>
          ) : graphData.nodes.length === 0 ? (
            <div className="x-mind-graph-empty">
              <p>No connected graph yet.</p>
              <p className="x-mind-graph-empty-hint">
                Graph RAG uses <strong>memories</strong> (datapoints) linked to <strong>entities</strong> via
                ontology rules — deals, requirements, blockers, integrations. Run pipeline work, connect
                integrations, or use <code>@mind</code> in compose. Try <strong>+ Memories</strong> if you only
                see isolated dots.
              </p>
            </div>
          ) : graphData.links.length === 0 ? (
            <div className="x-mind-graph-empty">
              <p>{graphData.nodes.length} entities but no relations in this view.</p>
              <p className="x-mind-graph-empty-hint">
                Most edges are <code>mentions</code> (memory → entity). Switch to <strong>+ Memories</strong> to
                see them, or ingest scoping content so ontology rules create deal/requirement links.
              </p>
            </div>
          ) : (
            <ForceGraph2D
              ref={graphRef}
              width={size.w}
              height={size.h}
              graphData={graphData}
              nodeId="id"
              linkCurvature={0.12}
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={0.92}
              nodeLabel={(n) => {
                const node = n as KbGraphNode
                const type = node.ontologyType ?? node.type
                return `${node.label}\n${type}${node.source ? ` · ${node.source}` : ''}`
              }}
              nodeColor={(n) => nodeColor(n as KbGraphNode)}
              nodeVal={(n) => nodeRadius(n as KbGraphNode)}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const n = node as GraphNode & { x: number; y: number }
                const r = nodeRadius(n)
                const color = nodeColor(n)
                const isSel = n.id === selected?.id
                const isMatch =
                  !query.trim() || n.label.toLowerCase().includes(query.trim().toLowerCase())

                ctx.beginPath()
                ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
                ctx.fillStyle = color
                ctx.globalAlpha = isMatch ? 1 : 0.35
                ctx.fill()
                ctx.globalAlpha = 1
                if (isSel) {
                  ctx.strokeStyle = '#faf9f5'
                  ctx.lineWidth = 2.5 / globalScale
                  ctx.stroke()
                }

                if (globalScale > 0.85 || n.ontologyType || n.kind === 'entity') {
                  const fontSize = Math.max(10 / globalScale, 3)
                  ctx.font = `${n.ontologyType || n.kind === 'entity' ? 600 : 400} ${fontSize}px system-ui, sans-serif`
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'top'
                  ctx.fillStyle = isMatch ? 'rgba(250,249,245,0.92)' : 'rgba(250,249,245,0.35)'
                  const label = n.label.length > 28 ? `${n.label.slice(0, 26)}…` : n.label
                  ctx.fillText(label, n.x, n.y + r + 2 / globalScale)
                }
              }}
              nodeCanvasObjectMode={() => 'replace'}
              linkColor={(l) => linkColor(l as GraphLink, selected, hoverLink)}
              linkWidth={(l) => linkWidth(l as GraphLink, hoverLink)}
              linkDirectionalParticles={(l) => {
                const link = l as GraphLink
                return link.relation !== 'mentions' && (hoverLink?.id === link.id || selected != null) ? 2 : 0
              }}
              linkDirectionalParticleWidth={2}
              linkLabel={(l) => formatRelation((l as GraphLink).relation)}
              onNodeClick={(n) => focusNode(n as KbGraphNode)}
              onBackgroundClick={() => setSelected(null)}
              onLinkHover={(l) => setHoverLink((l as GraphLink | null) ?? null)}
              cooldownTicks={100}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.35}
              onEngineStop={() => graphRef.current?.zoomToFit(500, 56)}
            />
          )}
          {hoverLink ? (
            <div className="x-mind-graph-link-tip">{formatRelation(hoverLink.relation)}</div>
          ) : null}
        </div>

        <aside className="x-mind-graph-inspector">
          {selected ? (
            <>
              <p className="x-mind-graph-inspector-kind">
                {selected.ontologyType ?? selected.type}
                {selected.kind === 'datapoint' && selected.source ? ` · ${selected.source}` : ''}
              </p>
              <h2 className="x-mind-graph-inspector-title">{selected.label}</h2>
              {selected.excerpt ? (
                <p className="x-mind-graph-inspector-excerpt">{selected.excerpt}</p>
              ) : null}
              {selected.mentionCount != null && selected.mentionCount > 1 ? (
                <p className="x-mind-graph-inspector-meta">{selected.mentionCount} mentions</p>
              ) : null}
              {selected.intention ? (
                <p className="x-mind-graph-inspector-meta">Intention: {selected.intention}</p>
              ) : null}
              <div className="x-mind-graph-relations">
                <h3>Connections ({neighbors.in.length + neighbors.out.length})</h3>
                {neighbors.out.length === 0 && neighbors.in.length === 0 ? (
                  <p className="x-mind-graph-inspector-meta">No edges in this view — try + Memories</p>
                ) : (
                  <ul>
                    {neighbors.out.map((l) => (
                      <li key={l.id}>
                        <span className="x-mind-graph-rel-type">{formatRelation(l.relation)}</span>
                        <span className="x-mind-graph-rel-arrow">→</span>
                        <button
                          type="button"
                          className="x-mind-graph-rel-node"
                          onClick={() => {
                            const target = snapshot?.nodes.find((n) => n.id === l.target)
                            if (target) focusNode(target)
                          }}
                        >
                          {labelById.get(l.target) ?? l.target}
                        </button>
                      </li>
                    ))}
                    {neighbors.in.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          className="x-mind-graph-rel-node"
                          onClick={() => {
                            const source = snapshot?.nodes.find((n) => n.id === l.source)
                            if (source) focusNode(source)
                          }}
                        >
                          {labelById.get(l.source) ?? l.source}
                        </button>
                        <span className="x-mind-graph-rel-arrow">→</span>
                        <span className="x-mind-graph-rel-type">{formatRelation(l.relation)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="x-mind-graph-inspector-empty">
              <p>Click a node to inspect its connections.</p>
              <p className="x-mind-graph-inspector-meta">
                Hover edges for relation type · drag to pan · scroll to zoom
              </p>
              <div className="x-mind-graph-rag-note">
                <h3>How Graph RAG uses this</h3>
                <p>
                  Chat and assist query your <strong>memories</strong>, boost results linked to matched{' '}
                  <strong>entities</strong>, and follow ontology edges (deal → requirement → blocker).
                  This view shows what the retriever can traverse — not every Gmail term.
                </p>
              </div>
              {relationLegend.length > 0 ? (
                <div className="x-mind-graph-legend">
                  <h3>Relations in view</h3>
                  <ul>
                    {relationLegend.map((rel) => (
                      <li key={rel}>
                        <span
                          className="x-mind-graph-legend-line"
                          style={{ background: RELATION_COLORS[rel] ?? 'rgba(250,249,245,0.35)' }}
                        />
                        {formatRelation(rel)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {legend.length > 0 ? (
                <div className="x-mind-graph-legend">
                  <h3>Node types</h3>
                  <ul>
                    {legend.map(([type, color]) => (
                      <li key={type}>
                        <span className="x-mind-graph-legend-dot" style={{ background: color }} />
                        {type.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
