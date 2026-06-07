import { falkorConfigured, getFalkorGraph } from './falkorClient'

export type GraphNeighbor = {
  id: string
  name?: string
  label?: string
}

/** 1–2 hop neighborhood around a deal vertex — for GraphRAG / feed salience. */
export async function getDealGraphNeighbors(
  engagementId: string,
  hops = 2
): Promise<GraphNeighbor[]> {
  if (!falkorConfigured()) return []
  const dealId = `gv-deal-${engagementId}`
  const graph = await getFalkorGraph()
  const depth = Math.min(Math.max(hops, 1), 3)

  const result = await graph.query<{ id: string; name: string; notchLabel: string }>(
    `MATCH (d:Deal {id: $dealId})-[*1..${depth}]-(n)
     RETURN DISTINCT n.id AS id, n.name AS name, n.notchLabel AS notchLabel
     LIMIT 120`,
    { params: { dealId } }
  )

  const rows = result.data ?? []
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name ? String(r.name) : undefined,
    label: r.notchLabel ? String(r.notchLabel) : undefined
  }))
}

export async function falkorGraphCounts(): Promise<{ nodes: number; edges: number } | null> {
  if (!falkorConfigured()) return null
  const graph = await getFalkorGraph()
  const nodes = await graph.query<{ c: number }>(`MATCH (n) RETURN count(n) AS c`)
  const edges = await graph.query<{ c: number }>(`MATCH ()-[r]->() RETURN count(r) AS c`)
  return {
    nodes: Number(nodes.data?.[0]?.c ?? 0),
    edges: Number(edges.data?.[0]?.c ?? 0)
  }
}
