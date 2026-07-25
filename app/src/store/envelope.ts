// The shared DispatchCandidate envelope shells - the ONE place the envelope is written.
//
// Canonical explanation, referenced by every zone's events.ts header: each builder in
// app/src is the PURE, isomorphic half of its surface. Given already-minted element ids
// (crypto.randomUUID at the app edge) it returns a well-formed DispatchCandidate for the
// M2-01 store; it mints NO id and reads NO clock/RNG - the store resolves event_id/ts
// from its injected providers, so every builder is a pure function of its inputs and
// runs headless under `node --test`. Layering (constitution / AGENTS.md): builders never
// decide WHETHER an event is valid - they only shape the candidate; the precompiled ajv
// validator inside the C8 event store decides acceptance, and C9 project() folds
// accepted events into canvas state. The view is never the source of truth.
//
// These two helpers exist so the envelope shell can never drift between zones:
// `sessionId` is carried as BOTH session_id and correlation_id, causation_id and
// compensates default to null, and provenance follows the two-ink rule - human events
// are ink, agent events are born pencil (the human accepts or rejects them later).
// schema_version defaults reflect when each family was ratified: human builders default
// to '1.0' (the M2-era ontology) and pass '1.2' explicitly for v0.4 events; every
// agent-authored event is v0.4+, so agentPencil defaults to '1.2'.

import type { EventPayload, EventType } from '@procezio/schema'
import type { DispatchCandidate } from './canvas-store.js'

/**
 * The human-authored, ink envelope shell (author 'local-user'). `causationId` is for the
 * rare builder that chains onto a prior event (e.g. flag.accepted cites the pencil event
 * it decides); everything else leaves it null.
 */
export function humanInk(
  sessionId: string,
  type: EventType,
  payload: EventPayload,
  opts?: { schemaVersion?: string; causationId?: string },
): DispatchCandidate {
  return {
    session_id: sessionId,
    type,
    author: { kind: 'human', id: 'local-user' },
    provenance: { state: 'ink' },
    payload,
    causation_id: opts?.causationId ?? null,
    correlation_id: sessionId,
    compensates: null,
    schema_version: opts?.schemaVersion ?? '1.0',
  }
}

/**
 * The agent-authored envelope shell, born pencil (two-ink rule p5: the agent drafts, the
 * human vetoes). `agentId` names the persona ('auditor', 'challenger', 'stakeholder', ...)
 * so provenance and the bench show WHO spoke. There is deliberately NO way to mark an
 * agent event ink here: the event store re-derives birth provenance from author.kind, so
 * an option would only suggest a capability the invariant forbids.
 */
export function agentPencil(
  sessionId: string,
  type: EventType,
  payload: EventPayload,
  agentId: string,
  opts?: { schemaVersion?: string },
): DispatchCandidate {
  return {
    session_id: sessionId,
    type,
    author: { kind: 'agent', id: agentId },
    provenance: { state: 'pencil' },
    payload,
    causation_id: null,
    correlation_id: sessionId,
    compensates: null,
    schema_version: opts?.schemaVersion ?? '1.2',
  }
}
