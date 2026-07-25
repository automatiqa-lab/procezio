// M2-06 acceptance test - the event-building helper of the Zone 3 (Friction) surface.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "buildFrictionPinnedCandidate builds a valid friction.pinned event that,
//    dispatched through the M2-01 store, appears in getCanvas().friction with the
//    correct node_id and waste"
//
// This proves the whole event -> (precompiled ajv validation) -> C9 projection ->
// what the view renders, at the layer a Node gate CAN prove: an event built by the
// pure helper, dispatched through the real M2-01 store (with injected deterministic
// id/ts providers, the store staying pure), lands in the C9 projection the UI reads
// from. Rendering itself (empty state, chip wiring, zero console errors under strict
// CSP) is proved separately by the screenshot-verified criterion, since a headless
// Node test cannot observe a browser.
//
// It imports ONLY pure modules (friction/events.ts, map/events.ts, canvas-store.ts,
// session.ts, @procezio/core, @procezio/schema types) - never a .tsx or React - so
// it runs headless with no React/DOM, exactly like map/events.test.ts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOWNTIME_WASTES,
  DOWNTIME_LABELS,
  wasteLabel,
  buildFrictionPinnedCandidate,
} from './events.js'
import { buildNodeCreatedCandidate } from '../map/events.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { Downtime, Friction, Node } from '@procezio/schema'

// A fixed, schema-valid session id (Uuid format). Reused as session_id +
// correlation_id on every candidate so all events land in one session's log.
const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f6071'

/** Deterministic UUID-format event_id provider (decimal digits are valid hex). */
function makeIdProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  }
}

/** Deterministic RFC3339 date-time provider (minute counter). */
function makeTsProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `2026-07-06T11:${String(n).padStart(2, '0')}:00Z`
  }
}

/** A store with a live session and one real node to pin friction against. */
function openStoreWithNode(nodeId: string): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  const node: Node = {
    id: nodeId,
    type: 'Step',
    lane: 'requester',
    label: 'Raise requisition',
    zone: 2,
  }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, node))
  return store
}

// --- The named acceptance test ------------------------------------------------

test('buildFrictionPinnedCandidate builds a valid friction.pinned event that, dispatched through the M2-01 store, appears in getCanvas().friction with the correct node_id and waste', () => {
  const NODE_ID = 'n-raise-req'
  const store = openStoreWithNode(NODE_ID)
  assert.equal(
    (getCanvas(store.getState()).friction ?? []).length,
    0,
    'no friction before the waste is tapped',
  )

  // The view mints the friction id at the app edge and builds a schema Friction;
  // the helper wraps it. Here we supply a fixed id so the test is deterministic.
  const friction: Friction = {
    id: 'f-waiting-1',
    waste: 'Waiting',
    node_id: NODE_ID,
    note: 'waits on the approver overnight',
  }
  store.getState().dispatch(buildFrictionPinnedCandidate(SESSION_ID, friction))

  const canvas = getCanvas(store.getState())
  const pinned = (canvas.friction ?? []).filter((f) => f.node_id === NODE_ID)
  assert.equal(pinned.length, 1, 'exactly one friction is pinned to the step')
  const projected = pinned[0]
  // Event -> (ajv) -> projection -> (what the view renders): correct node_id + waste.
  assert.equal(projected?.node_id, NODE_ID, 'the friction carries the correct node_id')
  assert.equal(projected?.waste, 'Waiting', 'the friction carries the correct waste')
  assert.equal(
    projected?.note,
    'waits on the approver overnight',
    'the optional note is carried through',
  )
  assert.equal(getError(store.getState()), null, 'a valid friction.pinned leaves lastError null')
})

// --- The optional note may be omitted (a valid friction without a note) --------

test('buildFrictionPinnedCandidate accepts a friction with no note (note is optional)', () => {
  const NODE_ID = 'n-raise-req'
  const store = openStoreWithNode(NODE_ID)

  const friction: Friction = { id: 'f-defects-1', waste: 'Defects', node_id: NODE_ID }
  store.getState().dispatch(buildFrictionPinnedCandidate(SESSION_ID, friction))

  const canvas = getCanvas(store.getState())
  const projected = (canvas.friction ?? []).find((f) => f.id === 'f-defects-1')
  assert.ok(projected, 'the note-less friction appears in getCanvas().friction')
  assert.equal(projected?.note, undefined, 'no note is stored when none was attached')
  assert.equal(
    getError(store.getState()),
    null,
    'a note-less friction.pinned leaves lastError null',
  )
})

// --- Multiple frictions upsert by id and group by node ------------------------

test('multiple frictions on the same step accumulate; each keeps its own waste (grouped by node_id)', () => {
  const NODE_ID = 'n-raise-req'
  const store = openStoreWithNode(NODE_ID)

  store
    .getState()
    .dispatch(
      buildFrictionPinnedCandidate(SESSION_ID, { id: 'f-1', waste: 'Waiting', node_id: NODE_ID }),
    )
  store
    .getState()
    .dispatch(
      buildFrictionPinnedCandidate(SESSION_ID, { id: 'f-2', waste: 'Motion', node_id: NODE_ID }),
    )

  const grouped = (getCanvas(store.getState()).friction ?? []).filter((f) => f.node_id === NODE_ID)
  assert.equal(grouped.length, 2, 'both frictions land in the same node group')
  assert.deepEqual(
    grouped.map((f) => f.waste).sort(),
    ['Motion', 'Waiting'],
    'each friction keeps its own waste under the same node_id',
  )
  assert.equal(getError(store.getState()), null, 'both valid frictions leave lastError null')
})

// --- The chip label list is exactly the schema's 8 DOWNTIME wastes ------------

test('DOWNTIME_WASTES lists all 8 wastes and every entry is a valid Downtime accepted by the store', () => {
  assert.equal(DOWNTIME_WASTES.length, 8, 'all eight DOWNTIME wastes are present as chips')
  // No duplicates, and the set matches the schema union exactly (compile-time via
  // `satisfies readonly Downtime[]`; runtime here proves each is store-acceptable).
  assert.equal(new Set(DOWNTIME_WASTES).size, 8, 'the eight wastes are distinct')

  const NODE_ID = 'n-raise-req'
  const store = openStoreWithNode(NODE_ID)
  DOWNTIME_WASTES.forEach((waste: Downtime, i) => {
    store
      .getState()
      .dispatch(
        buildFrictionPinnedCandidate(SESSION_ID, { id: `f-chip-${i}`, waste, node_id: NODE_ID }),
      )
  })
  const wastes = (getCanvas(store.getState()).friction ?? []).map((f) => f.waste)
  assert.equal(wastes.length, 8, 'every chip waste is accepted by the store and projected')
  assert.equal(getError(store.getState()), null, 'no waste is rejected by ajv')
})

test('C8 - every waste has a humanized display label, distinct, with the DOWNTIME value kept internal', () => {
  // The plain-language label is what the user reads; Friction.waste stays the formal taxonomy.
  DOWNTIME_WASTES.forEach((waste: Downtime) => {
    const label = wasteLabel(waste)
    assert.ok(label.length > 0, `${waste} has a display label`)
    assert.equal(label, DOWNTIME_LABELS[waste], 'wasteLabel resolves through the map')
  })
  // The labels a non-coder recognises are not the Lean jargon terms.
  assert.equal(wasteLabel('Non-utilized-talent'), 'Skills going to waste')
  assert.equal(wasteLabel('Extra-processing'), 'Double work')
  assert.notEqual(
    wasteLabel('Non-utilized-talent'),
    'Non-utilized-talent',
    'jargon is not shown raw',
  )
  // Labels are distinct so chips are unambiguous.
  const labels = DOWNTIME_WASTES.map(wasteLabel)
  assert.equal(new Set(labels).size, labels.length, 'display labels are all distinct')
})
