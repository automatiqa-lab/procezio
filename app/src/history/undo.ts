// M2-14 - the pure undo/redo history layer over the compensating-event model (C10).
//
// Undo is not a delete: it appends a COMPENSATING event that points (via `compensates`)
// at the tip of a target's chain. project() resolves chain parity - an odd number of
// stacked compensations removes the origin's effect, an even number re-applies it. So
// undo and redo are the SAME operation (compensate the current tip); they differ only
// in which origin's chain is extended and the resulting parity.
//
// This module is pure + isomorphic (no node:*, clock, or RNG): it reads the event log
// and decides WHICH event the next undo/redo should compensate. The store mints the
// compensating event (createCompensatingEvent) with injected id/ts and dispatches it.
//
// Only the reversible (by-id) families can be undone - the same set removeEffect knows
// how to reverse in C9. session/score/gate/case/frame/assumption mutate embedded or
// scalar state with no standalone element to restore, so they are not offered as undo
// targets (consistent with C10 scope).

import type { EventEnvelope } from '@procezio/core'
import type { AuditTagPayload, EdgePayload, FrictionPayload, NodePayload } from '@procezio/schema'

/** The families C9 removeEffect can reverse (by-id). Others are not undoable. */
const REVERSIBLE_TYPES: ReadonlySet<string> = new Set([
  'zone.completed',
  'node.created',
  'edge.created',
  'friction.pinned',
  'audit_tag.set',
  'opportunity.created',
])

/** One reversible origin and the current state of its compensation chain. */
interface ChainState {
  origin: EventEnvelope
  /** The most recent event in the chain (origin itself, or its latest compensation). */
  tip: EventEnvelope
  /** Number of compensations stacked on the origin. Odd = undone, even = applied. */
  depth: number
}

/**
 * Walk every reversible origin's compensation chain forward. For each origin O, follow
 * the links C where C.compensates === (current tip).event_id, deepest-last, counting
 * hops. Returns one ChainState per reversible origin, in origin-seq order.
 *
 * A compensation event is one that carries `compensates`; it is never itself an origin
 * (it belongs to some origin's chain), so origins are the reversible non-compensating
 * events.
 */
function chainStates(log: readonly EventEnvelope[]): ChainState[] {
  // Index compensations by what they compensate (target event_id -> the compensation).
  // A single target is compensated at most once in a linear chain; if the data ever
  // branched, the highest-seq child wins (deterministic, newest extends the chain).
  const byTarget = new Map<string, EventEnvelope>()
  for (const e of log) {
    if (e.compensates == null) continue
    const prev = byTarget.get(e.compensates)
    if (prev === undefined || e.seq > prev.seq) byTarget.set(e.compensates, e)
  }

  const out: ChainState[] = []
  for (const origin of log) {
    if (origin.compensates != null) continue // not an origin - part of a chain
    if (!REVERSIBLE_TYPES.has(origin.type)) continue
    let tip = origin
    let depth = 0
    // Follow the chain forward to its tip.
    for (;;) {
      const next = byTarget.get(tip.event_id)
      if (next === undefined) break
      tip = next
      depth += 1
    }
    out.push({ origin, tip, depth })
  }
  return out
}

/**
 * The event the NEXT undo should compensate, or null if nothing is undoable. Undo
 * targets the most recent APPLIED reversible origin (even depth); compensating its tip
 * extends the chain to odd depth, removing the origin's effect. Highest origin seq wins
 * so undo peels the most recent action first.
 */
export function nextUndoTarget(log: readonly EventEnvelope[]): EventEnvelope | null {
  let best: ChainState | null = null
  for (const cs of chainStates(log)) {
    if (cs.depth % 2 !== 0) continue // undone already
    if (best === null || cs.origin.seq > best.origin.seq) best = cs
  }
  return best === null ? null : best.tip
}

/**
 * The event the NEXT redo should compensate, or null if nothing is redoable. Redo
 * targets the most recently UNDONE origin (odd depth) - the one whose tip compensation
 * has the highest seq - so redo re-applies in LIFO order. Compensating that tip extends
 * the chain to even depth, re-applying the origin's effect.
 */
/**
 * The chain tips a targeted DELETE of one map element must compensate. Deletion is
 * not a new event family: it is the same C10 compensation the LIFO undo appends,
 * aimed at a SPECIFIC element instead of the most recent action. For a node that is
 * every APPLIED `node.created` origin carrying its id (an edited node has one origin
 * per same-id upsert - all must flip to odd parity or the earlier version resurfaces)
 * PLUS the applied origins of everything referencing it - its edges, its friction
 * pins, its data/rules profile - so removal never strands a dangling reference for
 * the case's source picker to cite. For an edge, its own applied origins.
 *
 * ORDER MATTERS for redo: dependents come FIRST and the node's own origins LAST, so
 * the compensations are appended dependents-then-node and the HistoryBar's LIFO redo
 * restores the NODE before anything that points at it - no intermediate frame ever
 * shows an edge or pin whose node is still absent.
 */
export function deletionTargetsFor(
  log: readonly EventEnvelope[],
  kind: 'node' | 'edge',
  elementId: string,
): EventEnvelope[] {
  const dependents: EventEnvelope[] = []
  const own: EventEnvelope[] = []
  for (const cs of chainStates(log)) {
    if (cs.depth % 2 !== 0) continue // already undone - nothing to remove
    switch (cs.origin.type) {
      case 'node.created': {
        if (kind === 'node' && (cs.origin.payload as NodePayload).node.id === elementId) {
          own.push(cs.tip)
        }
        break
      }
      case 'edge.created': {
        const edge = (cs.origin.payload as EdgePayload).edge
        if (kind === 'edge' && edge.id === elementId) own.push(cs.tip)
        // Node deletion cascades to the edges that connect to it.
        else if (kind === 'node' && (edge.from === elementId || edge.to === elementId)) {
          dependents.push(cs.tip)
        }
        break
      }
      case 'friction.pinned': {
        if (
          kind === 'node' &&
          (cs.origin.payload as FrictionPayload).friction.node_id === elementId
        ) {
          dependents.push(cs.tip)
        }
        break
      }
      case 'audit_tag.set': {
        if (
          kind === 'node' &&
          (cs.origin.payload as AuditTagPayload).audit_tag.node_id === elementId
        ) {
          dependents.push(cs.tip)
        }
        break
      }
    }
  }
  return [...dependents, ...own]
}

export function nextRedoTarget(log: readonly EventEnvelope[]): EventEnvelope | null {
  let best: ChainState | null = null
  for (const cs of chainStates(log)) {
    if (cs.depth % 2 === 0) continue // applied, nothing to redo
    if (best === null || cs.tip.seq > best.tip.seq) best = cs
  }
  return best === null ? null : best.tip
}
