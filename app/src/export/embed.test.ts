// PNG-with-embedded-session acceptance test (spec 01b Wave 2 H3).
//
// Named criterion: "embedding a session after PNG bytes leaves the PNG bytes intact and recovers
// the exact session on extract; a plain PNG (no marker) yields null; a re-embed recovers the
// newest session; a truncated block yields null rather than throwing." Pure bytes, deterministic.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { embedSessionInPng, extractSessionFromPng } from './embed.js'

// A stand-in "PNG": the real signature bytes + arbitrary payload. The embed logic does not parse
// the PNG, it appends after it, so any byte array stands in for the image.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5])
const SESSION = JSON.stringify({ pnav: 1, events: [{ type: 'session.started' }] })

test('embed then extract round-trips the exact session and preserves the PNG bytes', () => {
  const out = embedSessionInPng(PNG, SESSION)
  assert.deepEqual(out.subarray(0, PNG.length), PNG, 'the image bytes are untouched at the front')
  assert.equal(extractSessionFromPng(out), SESSION, 'the session round-trips exactly')
})

test('a plain PNG with no embedded session yields null', () => {
  assert.equal(extractSessionFromPng(PNG), null)
})

test('a re-embed recovers the newest session (the latest block wins)', () => {
  const once = embedSessionInPng(PNG, SESSION)
  const twice = embedSessionInPng(once, 'SECOND')
  assert.equal(extractSessionFromPng(twice), 'SECOND')
})

test('a truncated block yields null, never throws', () => {
  const out = embedSessionInPng(PNG, SESSION)
  const truncated = out.subarray(0, out.length - 5) // cut into the json body
  assert.equal(extractSessionFromPng(truncated), null)
})

test('unicode in the session survives the round-trip', () => {
  const s = JSON.stringify({ note: 'Rückstände über 30 Tage — kritisch' })
  assert.equal(extractSessionFromPng(embedSessionInPng(PNG, s)), s)
})
