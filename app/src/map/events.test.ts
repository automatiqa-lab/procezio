// M2-03 acceptance test - the event-building helpers of the Zone 2 (Map) surface.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "buildNodeCreatedCandidate builds a valid node.created event that, dispatched
//    through the M2-01 store, appears in getCanvas().nodes"
//
// This proves the whole event -> projection -> render contract at the layer a Node
// gate CAN prove: an event built by the pure helper, dispatched through the real
// M2-01 store (with injected deterministic id/ts providers, the store staying
// pure), lands in the C9 projection the UI renders from. Rendering itself (zero
// console errors under strict CSP) is proved separately by the screenshot-verified
// criterion, since a headless Node test cannot observe a browser.
//
// It imports ONLY pure modules (events.ts, layout.ts, canvas-store.ts, session.ts,
// @procezio/core, @procezio/schema) - never a .tsx or @xyflow/react - so it runs
// headless with no React/DOM, exactly like canvas-store.test.ts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNodeCreatedCandidate,
  buildNodeUpdatedCandidate,
  buildEdgeCreatedCandidate,
  nodeMetadataFrom,
} from './events.js'
import { layoutNodes, NODE_X_GAP, LANE_LEFT } from './layout.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { Edge, Node } from '@procezio/schema'

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

/** A store with a live session already opened, ready for Map mutations. */
function openStore(): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  return store
}

// --- The named acceptance test ------------------------------------------------

test('buildNodeCreatedCandidate builds a valid node.created event that, dispatched through the M2-01 store, appears in getCanvas().nodes (maps to the criterion: node:test covers event-building helpers - valid node.created constructed, dispatched through store, appears in projection)', () => {
  const store = openStore()
  assert.equal(getCanvas(store.getState()).nodes.length, 0, 'no nodes before the shape is added')

  // The toolbar mints the node id at the app edge and builds a schema Node; the
  // helper wraps it. Here we supply a fixed id so the test is deterministic.
  const node: Node = {
    id: 'n-raise-req',
    type: 'Step',
    lane: 'requester',
    label: 'Raise requisition',
    zone: 2,
  }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, node))

  const canvas = getCanvas(store.getState())
  // Event -> projection -> (what the view renders): the node is in the projection.
  const projected = canvas.nodes.find((n) => n.id === 'n-raise-req')
  assert.ok(projected, 'the created node must appear in getCanvas().nodes')
  assert.equal(projected?.type, 'Step', 'the node keeps its shape type through projection')
  // Adding a shape in an actor's lane materialises the lane (C9 ensureLane) - the
  // in-schema lane-creation path this card relies on.
  assert.ok(
    canvas.lanes.some((l) => l.id === 'requester'),
    'the node.lane materialises a lane so the swimlane can render',
  )
  assert.equal(getError(store.getState()), null, 'a valid node.created leaves lastError null')
})

// --- node.updated is realised as a same-id node.created upsert (ontology #11) ---

test('buildNodeUpdatedCandidate upserts the node in place (edits metadata, does not duplicate)', () => {
  const store = openStore()
  const node: Node = {
    id: 'n-raise-req',
    type: 'Step',
    lane: 'requester',
    label: 'Raise requisition',
    zone: 2,
  }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, node))

  const metadata = nodeMetadataFrom({
    actor: 'Requester',
    action: 'Submit requisition',
    system: 'ERP',
    input: '',
    output: 'PR number',
    time: '5 min',
  })
  const edited: Node = { ...node, label: 'Raise requisition (v2)', metadata }
  store.getState().dispatch(buildNodeUpdatedCandidate(SESSION_ID, edited))

  const canvas = getCanvas(store.getState())
  assert.equal(canvas.nodes.length, 1, 'update upserts in place - no duplicate node')
  const projected = canvas.nodes.find((n) => n.id === 'n-raise-req')
  assert.equal(projected?.label, 'Raise requisition (v2)', 'edited label appears in the projection')
  assert.equal(
    projected?.metadata?.action,
    'Submit requisition',
    'edited metadata appears in the projection',
  )
  assert.equal(
    projected?.metadata?.input,
    undefined,
    'empty metadata fields are dropped, not stored blank',
  )
  assert.equal(getError(store.getState()), null, 'a valid update leaves lastError null')
})

// --- edge.created via onConnect lands in the projection -----------------------

test('buildEdgeCreatedCandidate results in the edge appearing in getCanvas().edges', () => {
  const store = openStore()
  const a: Node = { id: 'n-a', type: 'Start', lane: 'requester', label: 'Start', zone: 2 }
  const b: Node = { id: 'n-b', type: 'Step', lane: 'requester', label: 'Do work', zone: 2 }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, a))
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, b))

  const edge: Edge = { id: 'e-a-b', from: 'n-a', to: 'n-b', kind: 'sequence' }
  store.getState().dispatch(buildEdgeCreatedCandidate(SESSION_ID, edge))

  const canvas = getCanvas(store.getState())
  assert.ok(
    canvas.edges.some((e) => e.id === 'e-a-b' && e.from === 'n-a' && e.to === 'n-b'),
    'the connected edge appears in getCanvas().edges',
  )
  assert.equal(getError(store.getState()), null, 'a valid edge.created leaves lastError null')
})

// --- layout is a pure, deterministic function that stores no x/y on nodes ------

test('layoutNodes is pure/deterministic and derives positions from lane + column, storing no coordinates on schema nodes', () => {
  const store = openStore()
  // Two lanes, three nodes: two in lane 0, one in lane 1.
  const nodes: Node[] = [
    { id: 'n1', type: 'Start', lane: 'requester', label: 'Start', zone: 2 },
    { id: 'n2', type: 'Step', lane: 'requester', label: 'Raise', zone: 2 },
    { id: 'n3', type: 'Step', lane: 'approver', label: 'Approve', zone: 2 },
  ]
  for (const n of nodes) store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, n))
  const canvas = getCanvas(store.getState())

  // No coordinate ever leaks onto a schema node.
  assert.ok(
    canvas.nodes.every((n) => !('x' in n) && !('y' in n) && !('position' in n)),
    'schema nodes carry no x/y/position - positions are derived, never stored',
  )

  const first = layoutNodes(canvas)
  const second = layoutNodes(canvas)
  assert.deepEqual(first, second, 'same canvas yields byte-identical positions')

  // Column 0 vs column 1 in the same lane differ by exactly NODE_X_GAP; the second
  // lane's node sits in a lower row than the first lane's.
  const p1 = first.find((p) => p.id === 'n1')
  const p2 = first.find((p) => p.id === 'n2')
  const p3 = first.find((p) => p.id === 'n3')
  assert.equal(p1?.x, LANE_LEFT, 'first node in a lane sits at column 0')
  assert.equal(p2?.x, LANE_LEFT + NODE_X_GAP, 'second node in the same lane advances one column')
  assert.equal(p1?.laneIndex, 0, 'first lane is row 0')
  assert.equal(p3?.laneIndex, 1, 'second lane is row 1')
  assert.ok((p3?.y ?? 0) > (p1?.y ?? 0), 'a lower lane row has a greater y')
})

test('a Decision node carrying a decision table (F5) is accepted and projected', () => {
  const store = openStore()
  const node: Node = {
    id: 'd1',
    type: 'Decision',
    lane: 'ap',
    label: 'Spot or contract?',
    zone: 2,
    decision_detail: {
      question: 'Spot or contract?',
      basis: 'written-rule',
      decision_table: [
        { when: 'volume > 10 loads/wk', then: 'contract rate' },
        { when: 'one-off', then: 'spot rate' },
      ],
    },
  }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, node))
  assert.equal(getError(store.getState()), null, 'the store accepts a decision table')
  const saved = getCanvas(store.getState()).nodes.find((n) => n.id === 'd1')
  assert.equal(saved?.decision_detail?.decision_table?.length, 2, 'both rules projected')
  assert.equal(saved?.decision_detail?.decision_table?.[0]?.then, 'contract rate')
})
