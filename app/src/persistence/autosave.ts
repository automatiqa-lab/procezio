// Autosave - the localStorage safety net under the explicit .pnav save.
//
// The .pnav file stays the explicit, portable artifact; this module is the net that
// catches a refresh, a crashed tab, or a close-without-saving, so a no-code user who
// never thought to hit Save does not lose half an hour of work. It reuses the .pnav
// FORMAT wholesale (serializePnav/parsePnav), so a restored autosave passes exactly the
// same full ajv re-validation an opened file does - an autosave is untrusted input like
// any other.
//
// Pure of the DOM: the storage backend is INJECTED (a Storage-shaped key-value store),
// so the logic runs headless under `node --test` with a plain Map-backed stub. No
// secrets can enter here by construction - the payload is the event log, and API keys
// never enter events or .pnav content (ci:security-solo).

import type { EventEnvelope } from '@procezio/core'
import { serializePnav, parsePnav, type ParseResult } from './pnav.js'

/** The subset of window.localStorage the autosave uses (injected, testable). */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** One well-known slot: the most recent session wins (a deliberate single safety net). */
export const AUTOSAVE_KEY = 'procezio.autosave.v1'

/** Sessions with only the opening session.started carry no user work - not worth saving. */
const MIN_EVENTS = 2

/**
 * The one dirty predicate: user work exists beyond what the last explicit save/load
 * covered (the opening session.started alone is never "work"). Shared by the session
 * bar's indicator and the beforeunload warning so the two can never disagree.
 */
export function hasUnsavedWork(eventCount: number, savedCount: number): boolean {
  return eventCount > Math.max(savedCount, MIN_EVENTS - 1)
}

/**
 * Persist the session log to the injected store. A quota error (private mode, full
 * storage) is swallowed: autosave is best-effort by design and must never break the
 * session it is trying to protect. Returns whether the write happened.
 */
export function writeAutosave(
  storage: KeyValueStore,
  sessionId: string,
  events: readonly EventEnvelope[],
): boolean {
  if (events.length < MIN_EVENTS) return false
  try {
    storage.setItem(AUTOSAVE_KEY, serializePnav(sessionId, events, { compact: true }))
    return true
  } catch {
    return false
  }
}

/**
 * Read + fully validate the autosaved session, or null when none (or an invalid one)
 * exists. Invalid content is cleared so a corrupt slot cannot re-offer itself forever.
 */
export function readAutosave(storage: KeyValueStore): ParseResult | null {
  let text: string | null
  try {
    text = storage.getItem(AUTOSAVE_KEY)
  } catch {
    return null
  }
  if (text === null) return null
  const parsed = parsePnav(text)
  if (!parsed.ok) {
    clearAutosave(storage)
    return null
  }
  return parsed
}

/** Drop the autosave slot (after an explicit discard, or on corrupt content). */
export function clearAutosave(storage: KeyValueStore): void {
  try {
    storage.removeItem(AUTOSAVE_KEY)
  } catch {
    /* best-effort */
  }
}
