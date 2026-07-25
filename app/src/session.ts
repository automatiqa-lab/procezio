// M2-02 - the app-boundary builder for the session.started candidate.
//
// "Session id generation occurs at the app boundary; the M2-01 store stays pure."
// This module is that boundary's PURE half: given an already-minted session id and
// a process name, it returns a well-formed `session.started` DispatchCandidate. It
// mints NO id and reads NO clock/RNG itself - the id is passed in (App.tsx mints it
// with crypto.randomUUID() and the store resolves event_id/ts from its injected
// providers). Keeping this function pure is what makes it node-testable exactly like
// canvas-store.ts, and keeps the "store never generates ids" invariant intact.
//
// DispatchCandidate is IMPORTED from the M2-01 store, which composes it from the
// core's EventCandidate and the ratified schema. Nothing here redefines an event or
// payload type - the fields below are the schema's required session.started shape
// (SessionPayload: process_name, ruleset_hash, prompt_pack_version), determinism
// inputs left "unassigned"/"0.0.0" until a ruleset/prompt-pack is bound to the session.

import type { DispatchCandidate } from './store/canvas-store.js'
import { humanInk } from './store/envelope.js'

/**
 * Build the `session.started` candidate dispatched through the M2-01 store on app
 * mount. `sessionId` is minted by the caller at the app boundary (never here); it
 * becomes both the candidate's `session_id` and its `correlation_id`. `event_id`
 * and `ts` are deliberately absent - the store resolves them from its injected
 * providers, so this stays a pure function of its two inputs.
 */
export function buildSessionStartedCandidate(
  sessionId: string,
  processName: string,
): DispatchCandidate {
  return humanInk(sessionId, 'session.started', {
    process_name: processName,
    ruleset_hash: 'unassigned',
    prompt_pack_version: '0.0.0',
  })
}
