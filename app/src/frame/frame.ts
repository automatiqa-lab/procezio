// M2-05 - the app-boundary event builder for the Zone 1 (Frame) form.
//
// The PURE, isomorphic half of the Frame zone: given the open session id and a
// PARTIAL FramePayload patch (only the field(s) the user just committed), it
// returns a well-formed `frame.set` DispatchCandidate for the M2-01 store. Exactly
// the discipline session.ts and map/events.ts use: this module mints NO id and
// reads NO clock/RNG - the store resolves event_id/ts from its injected providers,
// so this stays a pure function of its inputs and runs headless under `node --test`.
//
// Layering (constitution / AGENTS.md): this helper does not decide WHETHER the
// Frame edit is valid - it only shapes the candidate. The precompiled ajv validator
// inside the C8 event store (reached through the store's dispatch) decides
// acceptance; C9 project() merges the partial patch onto canvas.process (spread of
// only the keys present, so absent fields are never blanked). The Frame form is
// never the source of truth: every field commit leaves the UI as one of these
// candidates and only becomes canvas.process after the store accepts and re-projects.
//
// Schema note: frame.set is a v0.3 family, valid as of schema_version '1.1' (the
// amendment that added it - see the EventType enum and FramePayload in
// @procezio/schema). session.started is still '1.0'; a frame.set MUST carry '1.1'.

import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
// FramePayload is imported from the ratified schema, never redefined here
// (CardContract: "Process and FramePayload types imported from @procezio/schema").
// It mirrors Process with every field optional, so a partial patch is a valid
// FramePayload as long as it carries at least one field (schema minProperties 1).
import type { FramePayload } from '@procezio/schema'

/**
 * Build the `frame.set` candidate dispatched when the user commits a Frame field.
 * `sessionId` is the open session's id (minted at the app boundary and carried by
 * every candidate as both session_id and correlation_id, exactly as session.ts and
 * map/events.ts do). `patch` is the PARTIAL FramePayload the caller assembled from
 * the single field just committed - carrying only that field, so projection merges
 * it onto canvas.process without touching any other field. event_id and ts are
 * deliberately absent - the store resolves them from its injected providers, so this
 * stays a pure function of its inputs.
 */
export function buildFrameSetCandidate(sessionId: string, patch: FramePayload): DispatchCandidate {
  // frame.set is only valid from schema v1.1 (the v0.3 amendment); a '1.0'
  // envelope would carry no frame.set family. See the module header.
  return humanInk(sessionId, 'frame.set', patch, { schemaVersion: '1.1' })
}
