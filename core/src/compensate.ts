// C10 - the compensating-event constructor for @procezio/core.
//
// Undo/redo in an append-only log is not deletion - the log is immutable truth
// (specs/02 s.4, specs/02b C3). To undo event X you APPEND a compensating event
// that references X via `compensates`; the projection (projection.ts) reverses
// X's effect when it folds that reference. Redo is the same move again: a
// compensating event whose target is the undo event. This module owns exactly
// one thing - constructing a well-formed compensating event for ANY target,
// generically, so undo/redo never needs to know the target's family.
//
// Layering (constitution / AGENTS.md): this makes no generative judgement and
// reads no clock. Determinism is structural - event_id and ts are INJECTED by
// the caller (opts), never minted here with Date.now()/Math.random(), so the
// same target + opts always yields the same event. That is what lets the replay
// suite (C11) reproduce undo/redo byte-for-byte.
//
// Isomorphic by construction: imports nothing from node:*; structuredClone is a
// platform global (browser + Node >=17), not a node:* import, used only to clone
// the target payload so the compensating event is self-contained and cannot
// alias the target's payload object.

import type { Author, EventEnvelope } from '@procezio/schema'
// EventCandidate (the store's "envelope minus seq") is reused, never redefined:
// a compensating event is appended through the same store, which assigns its seq
// and re-derives its provenance birth state.
import type { EventCandidate } from './event-store.js'

/**
 * The determinism inputs a caller must inject to construct a compensating event.
 * All three are supplied from outside so the constructor stays a pure function of
 * its arguments (no clock, no id generator inside the fold-adjacent core).
 */
export interface CompensateOptions {
  /** The new event's id (a uuid), minted by the caller, not by this module. */
  eventId: string
  /** The new event's timestamp (ISO), supplied by the caller, not read here. */
  ts: string
  /** Who is performing the undo/redo. Drives the two-ink birth state downstream. */
  author: Author
}

/**
 * Construct the compensating event that reverses `target`. Generic over every
 * event family: it carries `type` = target.type and a deep clone of the target's
 * payload, so the compensating event validates against the SAME payload family as
 * its target and the projection can reverse the exact effect without any external
 * lookup of "what" the target did.
 *
 * Linkage:
 *  - `compensates` = target.event_id  -> the projection reverses THIS target.
 *  - `causation_id` = target.event_id  -> the undo was caused by that event.
 *  - `correlation_id` / `session_id` / `schema_version` inherit from the target,
 *    keeping the undo in the same session/replay context as what it reverses.
 *
 * Redo is not a special case: pass the undo event as `target` and the result is a
 * compensating event pointing at the undo (compensation-of-a-compensation), which
 * the projection resolves by chain parity.
 *
 * `provenance` is set to the caller's born state here as a sensible default; when
 * this candidate is appended, the event store re-derives provenance.state from
 * `author.kind` authoritatively (event-store.ts), so the two agree by rule.
 */
export function createCompensatingEvent(
  target: EventEnvelope,
  opts: CompensateOptions,
): EventCandidate {
  const bornState = opts.author.kind === 'human' ? 'ink' : 'pencil'
  return {
    event_id: opts.eventId,
    session_id: target.session_id,
    type: target.type,
    author: { ...opts.author },
    provenance: { state: bornState, accepted_by: null, accepted_at: null },
    // Self-contained: a clone, not an alias, of the target's payload. The
    // compensating event fully describes what it reverses.
    payload: structuredClone(target.payload),
    causation_id: target.event_id,
    correlation_id: target.correlation_id,
    compensates: target.event_id,
    schema_version: target.schema_version,
    ts: opts.ts,
  }
}
