// v0.4 token simulation route (spec 01b Wave 2 F2): the path a unit of work takes through the map.
//
// Pure: it walks the sequence edges from a Start node (or the first node) to build an ordered
// route, following the highest-priority forward edge at each step and stopping at an End, a dead
// end, or a revisit (so a rework loop cannot spin forever). This is the deterministic half; the
// animator (TokenSim.tsx) only moves a dot along the route's node positions. No LLM, no clock.

import type { Canvas } from '@procezio/schema'

/**
 * The ordered node ids a token travels, following forward (non-backedge) sequence edges from the
 * first Start node (or, if none, the first node). Rework back-edges are skipped, and a node is
 * never revisited, so the route always terminates. Returns [] for an empty map.
 */
export function flowRoute(canvas: Canvas): string[] {
  const nodes = canvas.nodes ?? []
  if (nodes.length === 0) return []
  const forward = (canvas.edges ?? []).filter((e) => e.kind !== 'exception-backedge')
  const nextOf = new Map<string, string[]>()
  for (const e of forward) {
    const list = nextOf.get(e.from) ?? []
    list.push(e.to)
    nextOf.set(e.from, list)
  }
  const start = nodes.find((n) => n.type === 'Start') ?? nodes[0]!
  const route: string[] = []
  const seen = new Set<string>()
  let cur: string | undefined = start.id
  while (cur !== undefined && !seen.has(cur)) {
    route.push(cur)
    seen.add(cur)
    // Take the first forward edge to an unvisited node (deterministic - edge order).
    cur = (nextOf.get(cur) ?? []).find((to) => !seen.has(to))
  }
  return route
}
