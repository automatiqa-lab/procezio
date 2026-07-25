// M2-03 - deterministic swimlane layout for the Zone 2 (Map) surface.
//
// Node positions are a PURE function of the projected canvas: the row is the index
// of the node's lane in canvas.lanes, and the column is the node's place in the
// GLOBAL process flow - its longest distance from a start along the edges, not a
// per-lane ordinal. Sequencing by the real flow is what keeps a hand-off between
// lanes a short vertical step instead of a long diagonal back across the canvas,
// so the map reads left-to-right like a process diagram. No x/y is ever stored on
// a node (the ratified schema Node has no coordinate fields, and
// additionalProperties:false would reject one) - React Flow is fed these computed
// positions and rendered non-draggable, so dragging can never imply persistence.
//
// Pure and isomorphic by construction: imports only the Canvas type, reads no
// clock/RNG, mutates nothing. The same canvas always yields byte-identical
// positions, which is what makes this node-testable without a DOM.

import type { Canvas } from '@procezio/schema'

/** Vertical size of one actor swimlane band, in flow units. */
export const LANE_HEIGHT = 150
/** Horizontal offset of the first node column, leaving room for the lane label. */
export const LANE_LEFT = 190
/** Horizontal distance between successive node columns within a lane. */
export const NODE_X_GAP = 200
/** Nominal shape width used only to centre a node within its lane band. */
export const NODE_WIDTH = 150
/** Nominal shape height used only to centre a node within its lane band. */
export const NODE_HEIGHT = 56
/** Side of the Decision diamond's square bounding box (shapes.tsx renders it at this size). */
export const DECISION_SIDE = NODE_HEIGHT + 24
/** A lane band is always at least this many columns wide, so empty lanes still read as lanes. */
export const MIN_LANE_COLUMNS = 4

/**
 * The FIXED rendered size of a shape, by node type. shapes.tsx draws every node at
 * exactly these dimensions, which is what lets FlowEdge compute edge anchor points
 * analytically instead of trusting DOM measurement (React Flow measures handles with
 * getBoundingClientRect, which the one-canvas camera scale() distorts - measured
 * anchors drift whenever the camera zoom differs between two measurements).
 */
export function nodeDims(type: string | undefined): { w: number; h: number } {
  return type === 'Decision'
    ? { w: DECISION_SIDE, h: DECISION_SIDE }
    : { w: NODE_WIDTH, h: NODE_HEIGHT }
}

/** A node's derived screen position plus the lane/column it was derived from. */
export interface NodePosition {
  id: string
  x: number
  y: number
  laneIndex: number
  column: number
}

/** A swimlane band's derived geometry, drawn behind the shape nodes. */
export interface LaneBand {
  id: string
  actor: string
  index: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * Row index of a lane. A lane present in canvas.lanes uses its array index; an
 * unknown lane (should not happen, since C9 ensureLane materialises a lane for
 * every node.lane) deterministically sinks below the known lanes rather than
 * throwing.
 */
export function laneIndexOf(canvas: Canvas, laneId: string): number {
  const i = canvas.lanes.findIndex((l) => l.id === laneId)
  return i === -1 ? canvas.lanes.length : i
}

/**
 * The flow column of every node: its longest distance from a start along the edges
 * (a Coffman-Graham style longest-path layering, via a Kahn topological pass). A
 * node with no incoming edge starts at column 0; every successor sits at least one
 * column past its deepest predecessor, so the drawing flows left-to-right and a
 * hand-off across lanes is a short step. Cycles/unreached nodes keep column 0 and
 * are separated by the per-lane collision pass in layoutNodes. Pure and deterministic:
 * edges are walked in canvas order, so the same canvas always yields the same columns.
 */
function flowColumns(canvas: Canvas): Map<string, number> {
  const ids = new Set(canvas.nodes.map((n) => n.id))
  const succ = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const n of canvas.nodes) indeg.set(n.id, 0)
  for (const e of canvas.edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue
    succ.set(e.from, [...(succ.get(e.from) ?? []), e.to])
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  const col = new Map<string, number>()
  const remaining = new Map(indeg)
  // Seed the queue with the roots (no incoming edge), in canvas order for determinism.
  const queue = canvas.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  for (const id of queue) col.set(id, 0)
  while (queue.length > 0) {
    const id = queue.shift() as string
    const here = col.get(id) ?? 0
    for (const to of succ.get(id) ?? []) {
      col.set(to, Math.max(col.get(to) ?? 0, here + 1))
      const left = (remaining.get(to) ?? 0) - 1
      remaining.set(to, left)
      if (left === 0) queue.push(to)
    }
  }
  // Any node left unresolved by a cycle keeps column 0 (a stable, if imperfect, place).
  for (const n of canvas.nodes) if (!col.has(n.id)) col.set(n.id, 0)
  return col
}

/**
 * Deterministic node positions for the whole canvas. Column is the node's place in
 * the global process flow (flowColumns); the row is its lane. Two nodes that would
 * land on the same lane AND column (parallel branches, or isolated nodes both at
 * column 0) are pushed right one column at a time until the cell is free, so nodes
 * never overlap. Processed in canvas insertion order, so the result is stable. The
 * input canvas is never mutated.
 */
export function layoutNodes(canvas: Canvas): NodePosition[] {
  const flow = flowColumns(canvas)
  const taken = new Set<string>() // `${laneIndex}:${column}` cells already occupied
  return canvas.nodes.map((node) => {
    const laneIndex = laneIndexOf(canvas, node.lane)
    let column = flow.get(node.id) ?? 0
    while (taken.has(`${laneIndex}:${column}`)) column += 1
    taken.add(`${laneIndex}:${column}`)
    return {
      id: node.id,
      laneIndex,
      column,
      x: LANE_LEFT + column * NODE_X_GAP,
      // Centre the shape's REAL rendered height in its band (the Decision diamond is
      // taller than the nominal NODE_HEIGHT; centring everything as 56px hung the
      // diamond below the band mid-line and put a permanent kink in its connectors).
      y: laneIndex * LANE_HEIGHT + (LANE_HEIGHT - nodeDims(node.type).h) / 2,
    }
  })
}

/**
 * The full width every lane band spans: enough to hold the rightmost node column in
 * the whole flow (so a hand-off that lands far to the right still sits on its band),
 * but never narrower than MIN_LANE_COLUMNS so sparse lanes still render as bands.
 */
export function laneWidth(canvas: Canvas): number {
  const maxColumn = layoutNodes(canvas).reduce((m, p) => Math.max(m, p.column), 0)
  const maxCols = Math.max(MIN_LANE_COLUMNS, maxColumn + 1)
  return LANE_LEFT + maxCols * NODE_X_GAP
}

/**
 * Deterministic swimlane band geometry, one per lane in canvas.lanes order. Bands
 * render behind the shape nodes (lower z-index) and are non-interactive; the label
 * shows lane.actor, which C9 derives from the lane id today.
 */
export function laneBands(canvas: Canvas): LaneBand[] {
  const width = laneWidth(canvas)
  return canvas.lanes.map((lane, index) => ({
    id: lane.id,
    actor: lane.actor,
    index,
    x: 0,
    y: index * LANE_HEIGHT,
    width,
    height: LANE_HEIGHT,
  }))
}
