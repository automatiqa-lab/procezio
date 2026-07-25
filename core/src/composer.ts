// v0.4 - the target-state composer (spec 01b section 9, decision R1H3kHjIEvLc).
//
// Deterministic rung transforms. Given committed opportunities pinned to map elements
// (Opportunity.target_refs) each carrying a rung, this builds a "to-be" Canvas by applying the
// rung's concrete transform, plus the list of changed elements and the handoff-count delta.
// The LLM does NOT run here - it only later names and narrates what this function decided
// (ComposerNamingOutput). Everything the composer produces is a hypothesis, born pencil, "not
// a promise", accepted into the case via tobe.snapshot.accepted.
//
// Pure + isomorphic: a function of (canvas, opportunities) alone. No clock, no RNG - bridging
// edge ids are derived from their endpoints so a re-run yields byte-identical output.
//
// The six transforms (spec section 9):
//   Remove      - delete the step and rejoin the flow (predecessors -> successors)
//   Standardize - collapse variance (varies -> false)
//   Connect     - a re-key edge becomes a system edge (the HD-2 fix)
//   Automate    - the step's actor lane becomes the System lane
//   Assist      - structure unchanged; the step is tagged as agent-assisted
//   Delegate    - the step moves to a Delegated-owner lane
// Assist and Delegate keep the flow intact by design (they change who/how, not the shape); the
// change is still recorded and tagged so the to-be sheet shows it.

import type {
  Canvas,
  Edge,
  Node,
  Opportunity,
  TaxonomyRung,
  EstimatorDelta,
} from '@procezio/schema'
import { handoffCount } from './estimator.js'

const SYSTEM_LANE = { id: 'lane-system', actor: 'System' }
const DELEGATED_LANE = { id: 'lane-delegated', actor: 'Delegated owner' }

/** One element the composer changed, tagged with the rung and the opportunity behind it. */
export interface ToBeChange {
  element_ref: string
  rung: TaxonomyRung
  opportunity_id: string
  note: string
}

/** The composed target state: a pencil Canvas, the changes that made it, and the handoff delta. */
export interface ComposeResult {
  toBe: Canvas
  changes: ToBeChange[]
  delta: EstimatorDelta
}

const clone = <T>(v: T): T => structuredClone(v)

function ensureLane(canvas: Canvas, lane: { id: string; actor: string }): void {
  if (!canvas.lanes.some((l) => l.id === lane.id)) canvas.lanes.push({ ...lane })
}

/** Remove a node and bridge its predecessors straight to its successors (sequence edges only). */
function removeAndRejoin(canvas: Canvas, nodeId: string): void {
  const seq = (e: Edge) => e.kind !== 'exception-backedge'
  const preds = canvas.edges.filter((e) => e.to === nodeId && seq(e)).map((e) => e.from)
  const succs = canvas.edges.filter((e) => e.from === nodeId && seq(e)).map((e) => e.to)
  canvas.edges = canvas.edges.filter((e) => e.from !== nodeId && e.to !== nodeId)
  canvas.nodes = canvas.nodes.filter((n) => n.id !== nodeId)
  for (const from of preds) {
    for (const to of succs) {
      if (from === to) continue
      const id = `tb-${from}-${to}`
      if (!canvas.edges.some((e) => e.id === id)) {
        canvas.edges.push({ id, from, to, kind: 'sequence' })
      }
    }
  }
}

/** Apply one opportunity's rung transform to one target element, mutating `toBe` in place. */
function applyTransform(
  toBe: Canvas,
  rung: TaxonomyRung,
  elementRef: string,
  opportunityId: string,
): ToBeChange | null {
  const node: Node | undefined = toBe.nodes.find((n) => n.id === elementRef)
  const edge: Edge | undefined = toBe.edges.find((e) => e.id === elementRef)
  const change = (note: string): ToBeChange => ({
    element_ref: elementRef,
    rung,
    opportunity_id: opportunityId,
    note,
  })

  switch (rung) {
    case 'Remove':
      if (!node) return null
      removeAndRejoin(toBe, elementRef)
      return change('Removed the step and rejoined the flow.')
    case 'Standardize':
      if (!node) return null
      node.varies = false
      return change('Standardized: variance collapsed.')
    case 'Connect':
      if (edge) {
        edge.medium = 'system'
        return change('Connected: the re-key handoff becomes a system link.')
      }
      return node ? change('Connected: duplicate entry merged (agent to narrate).') : null
    case 'Automate':
      if (!node) return null
      node.lane = SYSTEM_LANE.id
      ensureLane(toBe, SYSTEM_LANE)
      return change('Automated: the actor lane becomes the System lane.')
    case 'Assist':
      if (!node) return null
      return change('Assisted: the agent supports this step; the flow is unchanged.')
    case 'Delegate':
      if (!node) return null
      node.lane = DELEGATED_LANE.id
      ensureLane(toBe, DELEGATED_LANE)
      return change('Delegated: the step moves to a new owner lane.')
    default:
      return null
  }
}

/**
 * Compose the target state from committed, element-pinned opportunities. Only opportunities
 * that are committed AND carry a rung AND carry target_refs contribute (the composer fires
 * post-triage on committed ideas, spec section 9). Order is deterministic: opportunities in
 * array order, then their target_refs in order.
 */
export function composeToBe(canvas: Canvas, opportunities: readonly Opportunity[]): ComposeResult {
  // Fast path: with nothing to transform (no committed opportunity carrying a rung and
  // element pins), the to-be IS the as-is - definitionally zero changes, zero delta.
  // The map view recomputes this on every dispatch, so skipping the full-canvas clone
  // and the double handoff scan in the overwhelmingly common state is real savings.
  const applicable = opportunities.some(
    (o) => o.committed === true && o.rung !== undefined && (o.target_refs ?? []).length > 0,
  )
  if (!applicable) return { toBe: canvas, changes: [], delta: { handoff_count: 0 } }

  const asIsHandoffs = handoffCount(canvas)
  const toBe = clone(canvas)
  const changes: ToBeChange[] = []

  for (const opp of opportunities) {
    if (opp.committed !== true || opp.rung === undefined) continue
    for (const ref of opp.target_refs ?? []) {
      const c = applyTransform(toBe, opp.rung, ref, opp.id)
      if (c) changes.push(c)
    }
  }

  const toBeHandoffs = handoffCount(toBe)
  const delta: EstimatorDelta = { handoff_count: toBeHandoffs - asIsHandoffs }

  return { toBe, changes, delta }
}
