// C8 - isomorphic event store for @procezio/core.
//
// The immutable, attributed event log is the source of truth (specs/02 s.4,
// specs/02b C3). This module owns two invariants and nothing else:
//   1. every accepted event gets a monotonic, gap-free, PER-SESSION seq, and
//   2. only events that satisfy the EventEnvelope contract are stored.
//
// Layering (constitution / AGENTS.md): the store does NOT decide whether an
// event is "good enough" by any generative judgement - the deterministic ajv
// validation against canvas.schema.json decides. The store only assigns order
// and holds the log.
//
// Isomorphic by construction: this file imports nothing from node:* and reads
// no files. Validation is done by the PRECOMPILED validateEventEnvelope imported
// from @procezio/schema - an ajv STANDALONE validator generated at build time from
// canvas.schema.json (ci:validators-drift keeps it in lock-step with the schema).
// The store no longer constructs ajv at runtime: runtime ajv compiles schemas with
// `new Function`, which the Solo bundle's strict CSP (`script-src 'self'`, no
// 'unsafe-eval') blanks. The precompiled validator contains zero eval / new Function,
// so the identical module runs in the browser Solo bundle and in the Node relay.

import type { ErrorObject } from 'ajv'
// The EventEnvelope type is generated from canvas.schema.json (C7) and is the
// single source of truth - the store imports it, never redefines it, so the
// storage layer's type cannot drift from the ratified schema. Provenance is
// imported for the same reason (never redefined) - it drives the deterministic
// two-ink birth rule below. validateEventEnvelope is the precompiled validator for
// that same contract, imported (never re-implemented) from the schema package.
import { validateEventEnvelope } from '@procezio/schema'
import type { EventEnvelope, Provenance } from '@procezio/schema'

export type { EventEnvelope }

/**
 * What a caller hands to append(): a full envelope MINUS the seq. The store is
 * the sole authority on seq - any seq present on the incoming object is ignored
 * and overwritten with the assigned per-session value.
 */
export type EventCandidate = Omit<EventEnvelope, 'seq'>

/**
 * Discriminated result of append(). Rejections carry ajv's ErrorObject[] rather
 * than throwing, so callers and tests can assert on WHY an event was rejected.
 */
export type AppendResult = { ok: true; event: EventEnvelope } | { ok: false; errors: ErrorObject[] }

export interface EventStore {
  /**
   * Validate a candidate against the EventEnvelope contract and, only if it
   * passes, assign the next per-session seq and store it. A rejected candidate
   * never consumes a seq number, so accepted seqs are gap-free by construction.
   */
  append(candidate: EventCandidate): AppendResult
  /** The accepted event log for one session, in append order. */
  eventsFor(sessionId: string): readonly EventEnvelope[]
  /** The highest seq assigned in one session (0 if none accepted yet). */
  lastSeq(sessionId: string): number
}

export function createEventStore(): EventStore {
  // Validation is the PRECOMPILED validateEventEnvelope imported from
  // @procezio/schema - an ajv STANDALONE validator generated at build time from
  // canvas.schema.json (ci:validators-drift keeps it in lock-step). The store no
  // longer constructs ajv at runtime, so it is zero-arg: there is no schema to
  // inject because the contract is baked into the imported validator. Semantics are
  // byte-identical to the old runtime path (same schema, same ajv 8.17.1, allErrors,
  // ErrorObject[] on reject) - only the `new Function` compile step is gone, which is
  // exactly what the Solo bundle's strict CSP forbids.
  const validate = validateEventEnvelope

  // Per-session state. Keyed by envelope.session_id so seq is per session, not
  // global - two independent sessions each count from 1.
  const logs = new Map<string, EventEnvelope[]>()
  const lastSeqBySession = new Map<string, number>()

  function append(candidate: EventCandidate): AppendResult {
    const sessionId = candidate.session_id
    const prev = lastSeqBySession.get(sessionId) ?? 0
    const seq = prev + 1

    // Two-ink birth rule (constitution p5): provenance.state is store-authored,
    // not caller-trusted, exactly as seq is. It is derived deterministically from
    // author.kind - a human authors ink, an agent authors pencil - overwriting
    // whatever the candidate supplied. accepted_by/accepted_at pass through (a
    // fresh contribution is unaccepted, so they default to null). This makes the
    // "agent events born pencil / human events born ink" invariant a property of
    // the log itself, not of caller discipline.
    const bornState: Provenance['state'] = candidate.author.kind === 'human' ? 'ink' : 'pencil'
    const provenance: Provenance = {
      accepted_by: candidate.provenance.accepted_by ?? null,
      accepted_at: candidate.provenance.accepted_at ?? null,
      state: bornState,
    }

    // Validation happens on the fully-formed envelope BEFORE the counter is
    // advanced. seq and provenance.state are set here regardless of any value the
    // caller supplied - the store is the single authority on ordering and on the
    // ink/pencil birth state.
    const event: EventEnvelope = { ...candidate, seq, provenance }

    if (!validate(event)) {
      // Rejected: do NOT advance the counter, do NOT store. The number `seq`
      // was never committed, so the next valid append reuses it - no gaps.
      return { ok: false, errors: validate.errors ?? [] }
    }

    lastSeqBySession.set(sessionId, seq)
    const log = logs.get(sessionId) ?? []
    log.push(event)
    logs.set(sessionId, log)
    return { ok: true, event }
  }

  function eventsFor(sessionId: string): readonly EventEnvelope[] {
    return logs.get(sessionId) ?? []
  }

  function lastSeq(sessionId: string): number {
    return lastSeqBySession.get(sessionId) ?? 0
  }

  return { append, eventsFor, lastSeq }
}
