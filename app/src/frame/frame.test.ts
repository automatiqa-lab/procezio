// M2-05 acceptance test - the Zone 1 (Frame) event builder.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "buildFrameSetCandidate builds a valid frame.set event that, dispatched through
//    the M2-01 store, merges as a partial patch onto getCanvas().process without
//    blanking previously-set fields"
//
// This proves the whole frame.set -> projection contract at the layer a Node gate
// CAN prove: a partial patch built by the pure helper, dispatched through the real
// M2-01 store (with injected deterministic id/ts providers so the store stays
// pure), merges onto the C9 projection the Frame form renders from - each patch
// carrying ONLY its one field, and later patches never blanking earlier fields.
// Rendering itself (the north-star anchor, zero console errors under strict CSP) is
// proved separately by the screenshot-verified criterion, since a headless Node
// test cannot observe a browser.
//
// It imports ONLY pure modules (frame.ts, canvas-store.ts, session.ts,
// @procezio/schema) - never FrameZone.tsx or any React/DOM - so it runs headless
// exactly like events.test.ts and canvas-store.test.ts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFrameSetCandidate } from './frame.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { FramePayload } from '@procezio/schema'

// A fixed, schema-valid session id (Uuid format). Reused as session_id +
// correlation_id on every candidate so all events land in one session's log.
const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f6071'

/** Deterministic UUID-format event_id provider (decimal digits are valid hex). */
function makeIdProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  }
}

/** Deterministic RFC3339 date-time provider (minute counter). */
function makeTsProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `2026-07-07T09:${String(n).padStart(2, '0')}:00Z`
  }
}

/** A store with a live session already opened, ready for Frame commits. */
function openStore(): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })
  // session.started sets ONLY the process name; every other Frame field starts at
  // its emptyCanvas default, so we can prove frame.set fills them in.
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Untitled process'))
  return store
}

// --- The named acceptance test ------------------------------------------------

test('buildFrameSetCandidate builds a valid frame.set event that, dispatched through the M2-01 store, merges as a partial patch onto getCanvas().process without blanking previously-set fields', () => {
  const store = openStore()
  // Baseline: the name is set from session.started; the other fields are at their
  // emptyCanvas defaults (empty strings / absent optionals).
  assert.equal(
    getCanvas(store.getState()).process.name,
    'Untitled process',
    'name seeded by session.started',
  )
  assert.equal(
    getCanvas(store.getState()).process.north_star,
    '',
    'north_star empty before any frame.set',
  )

  // (1) Commit the north-star field. The candidate the form hands to dispatch must
  // carry EXACTLY the one committed field - nothing else - so projection touches
  // only that key.
  const northPatch: FramePayload = { north_star: 'cut cycle time from 3 days to 1' }
  const northCandidate = buildFrameSetCandidate(SESSION_ID, northPatch)
  assert.equal(northCandidate.type, 'frame.set', 'the builder emits a frame.set event')
  assert.equal(
    northCandidate.schema_version,
    '1.1',
    'frame.set carries the v1.1 envelope (v0.3 family)',
  )
  assert.deepEqual(
    Object.keys(northCandidate.payload as Record<string, unknown>),
    ['north_star'],
    'the payload carries ONLY the single committed field',
  )
  store.getState().dispatch(northCandidate)

  let process = getCanvas(store.getState()).process
  assert.equal(
    process.north_star,
    'cut cycle time from 3 days to 1',
    'north_star patched onto canvas.process',
  )
  assert.equal(
    process.name,
    'Untitled process',
    'the earlier name is untouched by the north_star patch',
  )
  assert.equal(process.trigger, '', 'a field never mentioned keeps its emptyCanvas default')
  assert.equal(getError(store.getState()), null, 'a valid frame.set leaves lastError null')

  // (2) Commit a second, different field (owner). This is the merge-not-replace
  // proof: after it, BOTH north_star (from patch 1) and owner (from patch 2) are
  // present - the second patch did not blank the first field.
  const ownerCandidate = buildFrameSetCandidate(SESSION_ID, { owner: 'Procurement ops' })
  assert.deepEqual(
    Object.keys(ownerCandidate.payload as Record<string, unknown>),
    ['owner'],
    'the second patch also carries ONLY its one field',
  )
  store.getState().dispatch(ownerCandidate)

  process = getCanvas(store.getState()).process
  assert.equal(process.owner, 'Procurement ops', 'owner patched onto canvas.process')
  assert.equal(
    process.north_star,
    'cut cycle time from 3 days to 1',
    'north_star from the first patch is NOT blanked',
  )
  assert.equal(process.name, 'Untitled process', 'name still untouched after the second patch')
  assert.equal(getError(store.getState()), null, 'the second valid frame.set leaves lastError null')
})

// --- re-committing one field overwrites only that field -----------------------

test('a later frame.set on an already-set field overwrites only that field, leaving the rest of the Frame intact', () => {
  const store = openStore()
  store
    .getState()
    .dispatch(buildFrameSetCandidate(SESSION_ID, { trigger: 'a purchase request arrives' }))
  store.getState().dispatch(buildFrameSetCandidate(SESSION_ID, { north_star: 'first north-star' }))

  // Re-commit the north_star field with an edited value.
  store
    .getState()
    .dispatch(buildFrameSetCandidate(SESSION_ID, { north_star: 'revised north-star' }))

  const process = getCanvas(store.getState()).process
  assert.equal(
    process.north_star,
    'revised north-star',
    'the re-committed field takes the new value',
  )
  assert.equal(
    process.trigger,
    'a purchase request arrives',
    'the untouched trigger field is preserved',
  )
  assert.equal(getError(store.getState()), null, 'each valid frame.set leaves lastError null')
})

// --- the degenerate empty patch is rejected by the validator, not the builder ---

test('an empty frame.set payload is rejected by the store validator (minProperties 1), leaving canvas.process unchanged', () => {
  const store = openStore()
  const before = getCanvas(store.getState()).process
  // The form never emits this (it guards on a changed, non-identical value), but the
  // deterministic validator - not the pure builder - is what forbids the degenerate
  // empty patch. Proving that keeps the layering honest: the builder shapes, the
  // gate decides.
  store.getState().dispatch(buildFrameSetCandidate(SESSION_ID, {}))

  assert.notEqual(
    getError(store.getState()),
    null,
    'an empty frame.set is rejected by ajv (minProperties 1)',
  )
  assert.deepEqual(
    getCanvas(store.getState()).process,
    before,
    'a rejected frame.set does not mutate canvas.process',
  )
})

test('the pain-first field (C3) merges onto canvas.process.pain', () => {
  const store = openStore()
  store.getState().dispatch(buildFrameSetCandidate(SESSION_ID, { pain: 'invoices sit for days' }))
  assert.equal(getError(store.getState()), null, 'a pain patch is accepted')
  assert.equal(getCanvas(store.getState()).process.pain, 'invoices sit for days')
})
