// M2-15 - the .pnav session-file format (pure, isomorphic).
//
// Solo persistence (specs/02b): a session is its event log, and the log persists as a
// .pnav file via storage adapters. This module is the FORMAT half - serialize the log
// to a .pnav string and parse a .pnav string back to a validated log. No I/O here (that
// is the storage adapter's job); no clock, no RNG - pure, so it runs headless.
//
// A .pnav is UNTRUSTED input (specs/05 security posture): on parse, EVERY event is
// re-validated against the ratified envelope contract (the same precompiled ajv
// validator the event store uses), and the container shape is checked. A malformed or
// tampered file is rejected whole - never partially loaded. Provenance forgery is
// defeated at REPLAY, not here: when the loaded events are re-appended, the event store
// re-derives provenance.state from author.kind, so a file that claims provenance:ink on
// an agent event cannot fake human acceptance (it becomes pencil again).
//
// The file carries NO secrets: only the event log. API keys never enter a .pnav
// (enforced by the ci:security-solo gate).

import { validateEventEnvelope } from '@procezio/schema'
import type { EventEnvelope } from '@procezio/core'

/** The current .pnav container version. Bumped only on a breaking format change. */
export const PNAV_VERSION = 1
/**
 * Import size ceiling (characters). A real session is tens of kilobytes; a .pnav is
 * untrusted input, and an unbounded JSON.parse of an arbitrarily large file is a
 * memory-DoS vector, so anything implausibly large is refused before parsing.
 */
export const PNAV_MAX_CHARS = 10_000_000
/** The file-type marker; a file without it is not a .pnav. */
export const PNAV_FORMAT = 'pnav' as const

/** The .pnav container: a versioned envelope around one session's event log. */
export interface PnavFile {
  format: typeof PNAV_FORMAT
  version: number
  session_id: string
  /** The schema/contract version the session was authored under (replay pin). */
  schema_version: string
  events: EventEnvelope[]
}

/** Result of parsing a .pnav string: the validated events, or a human-readable error. */
export type ParseResult =
  { ok: true; sessionId: string; events: EventEnvelope[] } | { ok: false; error: string }

/**
 * Serialize one session's event log to a .pnav string (pretty JSON + trailing newline).
 * `events` is the full accepted log for the session, in seq order. The schema_version
 * is taken from the first event (session-pinned upstream); an empty log is refused -
 * there is nothing to persist.
 */
export function serializePnav(
  sessionId: string,
  events: readonly EventEnvelope[],
  opts?: { compact?: boolean },
): string {
  const schema_version = events[0]?.schema_version ?? '1.0'
  // compact: the autosave slot rewrites the WHOLE log on a debounce after every edit,
  // so it skips the per-event defensive clone (JSON.stringify never mutates, and the
  // store's envelopes are not mutated elsewhere) and the pretty-printing that roughly
  // doubles the payload. The human-facing explicit Save keeps both: a .pnav is a
  // diff-friendly file people open.
  const file: PnavFile = {
    format: PNAV_FORMAT,
    version: PNAV_VERSION,
    session_id: sessionId,
    schema_version,
    events: opts?.compact === true ? [...events] : events.map((e) => structuredClone(e)),
  }
  return opts?.compact === true ? JSON.stringify(file) : JSON.stringify(file, null, 2) + '\n'
}

/**
 * Parse + fully validate a .pnav string. Checks the container shape, the format marker,
 * a supported version, and re-validates EVERY event against the ratified envelope
 * contract. Returns the events on success (to be replayed through the store, which
 * re-derives provenance) or a descriptive error on any failure - never a partial load.
 */
export function parsePnav(text: string): ParseResult {
  if (text.length > PNAV_MAX_CHARS) {
    return {
      ok: false,
      error: `Not a plausible .pnav file: ${Math.round(text.length / 1_000_000)} MB is far larger than any session log.`,
    }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not a valid .pnav file: the contents are not JSON.' }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Not a valid .pnav file: expected a JSON object.' }
  }
  const obj = raw as Record<string, unknown>
  if (obj.format !== PNAV_FORMAT) {
    return { ok: false, error: 'Not a .pnav file: the format marker is missing or wrong.' }
  }
  if (typeof obj.version !== 'number' || obj.version > PNAV_VERSION) {
    return {
      ok: false,
      error: `Unsupported .pnav version: ${String(obj.version)} (this build reads up to ${PNAV_VERSION}).`,
    }
  }
  if (typeof obj.session_id !== 'string' || obj.session_id.length === 0) {
    return { ok: false, error: 'Corrupt .pnav file: the session id is missing.' }
  }
  if (!Array.isArray(obj.events)) {
    return { ok: false, error: 'Corrupt .pnav file: the event log is missing.' }
  }
  // Array.isArray widens to any[]; treat the entries as untrusted `unknown` so the ajv
  // guard below is the only thing that can promote one to an EventEnvelope.
  const rawEvents = obj.events as unknown[]
  // Re-validate every event against the ratified contract. One bad event fails the
  // whole load - a session must not be half-restored.
  const events: EventEnvelope[] = []
  for (let i = 0; i < rawEvents.length; i += 1) {
    const candidate: unknown = rawEvents[i]
    if (!validateEventEnvelope(candidate)) {
      const first = validateEventEnvelope.errors?.[0]
      const where = first ? `${first.instancePath} ${first.message}` : 'schema-invalid'
      return { ok: false, error: `Corrupt .pnav file: event ${i} is invalid (${where}).` }
    }
    events.push(candidate)
  }
  if (events.length === 0) {
    return { ok: false, error: 'Empty .pnav file: no events to restore.' }
  }
  return { ok: true, sessionId: obj.session_id, events }
}
