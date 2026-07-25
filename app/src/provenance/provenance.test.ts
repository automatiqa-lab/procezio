// M2-16 acceptance test - two-ink provenance: pending pencil, accept -> ink, reject -> gone.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "an agent-authored node is born pencil and appears in store.pencilItems; acceptPencil
//    flips it to ink (it stays on the canvas, leaves the pending list); rejectPencil
//    removes it from the canvas AND the pending list; a human-authored node is never
//    pending (born ink)"
//
// Proves the whole two-ink loop at the layer a Node gate CAN prove: the real
// provenanceOf projection, the real flag.accepted events, the real M2-01 store. The
// amber-pencil rendering + the review panel are proved by the screenshot criterion.
//
// Imports ONLY pure modules - never a .tsx or React.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pendingPencil } from './pencil.js'
import { seedCandidates, type SeedOutput } from '../tasks/seed.js'
import { createCanvasStore, getCanvas } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import { buildNodeCreatedCandidate } from '../map/events.js'
import type { Node } from '@procezio/schema'

const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f607c'

function idProvider(): () => string {
  let n = 0
  return () => `20000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`
}
function tsProvider(): () => string {
  let n = 0
  return () => `2026-07-11T09:${String((n += 1)).padStart(2, '0')}:00Z`
}
function openStore(): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({ eventIdProvider: idProvider(), tsProvider: tsProvider() })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  return store
}

const nodeIds = (store: ReturnType<typeof createCanvasStore>) =>
  getCanvas(store.getState()).nodes.map((n) => n.id)

// --- The named acceptance test ------------------------------------------------

test('an agent node is born pencil and pending; accept -> ink & off the list; reject -> removed; a human node is never pending', () => {
  const store = openStore()
  // The agent seeds one node (a pencil candidate).
  const seed: SeedOutput = {
    nodes: [{ id: 'n-a', type: 'Step', lane: 'ap', label: 'Match', zone: 2 }],
  }
  for (const c of seedCandidates(SESSION_ID, seed)) store.getState().dispatch(c)

  assert.deepEqual(nodeIds(store), ['n-a'], 'the pencil node is on the canvas')
  let pending = store.getState().pencilItems
  assert.equal(pending.length, 1, 'the agent node is pending review')
  assert.equal(pending[0]?.key, 'node:n-a', 'the pending item keys the node')
  assert.equal(store.getState().provenance.get('node:n-a')?.state, 'pencil', 'born pencil')

  // Accept it -> ink, stays on the canvas, off the pending list.
  store.getState().acceptPencil(pending[0]!.targetEventId)
  assert.deepEqual(nodeIds(store), ['n-a'], 'an accepted node stays on the canvas')
  assert.equal(
    store.getState().provenance.get('node:n-a')?.state,
    'ink',
    'accept flips pencil -> ink',
  )
  assert.equal(store.getState().pencilItems.length, 0, 'an accepted node is no longer pending')

  // A second agent node, then reject it -> removed from canvas AND the list.
  for (const c of seedCandidates(SESSION_ID, {
    nodes: [{ id: 'n-b', type: 'Step', lane: 'ap', label: 'Pay', zone: 2 }],
  })) {
    store.getState().dispatch(c)
  }
  pending = store.getState().pencilItems
  assert.equal(pending.length, 1, 'n-b is pending')
  store.getState().rejectPencil(pending[0]!.targetEventId)
  assert.deepEqual(nodeIds(store), ['n-a'], 'a rejected node is removed from the canvas')
  assert.equal(store.getState().pencilItems.length, 0, 'a rejected node is off the pending list')

  // A HUMAN node is born ink - never pending.
  const human: Node = { id: 'n-c', type: 'Step', lane: 'ap', label: 'Human step', zone: 2 }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, human))
  assert.equal(
    store.getState().provenance.get('node:n-c')?.state,
    'ink',
    'a human node is born ink',
  )
  assert.equal(store.getState().pencilItems.length, 0, 'a human node is never pending')
})

// --- seedCandidates shapes agent-authored, pencil node/edge candidates --------

test('seedCandidates builds agent-authored pencil node.created + edge.created candidates', () => {
  const seed: SeedOutput = {
    lanes: [{ id: 'req', actor: 'Requester' }],
    nodes: [
      { id: 'n1', type: 'Start', lane: 'req', label: 'Need', zone: 2 },
      { id: 'n2', type: 'Step', lane: 'req', label: 'Raise', zone: 2 },
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', kind: 'sequence' }],
  }
  const cands = seedCandidates(SESSION_ID, seed)
  assert.equal(cands.length, 3, 'two nodes + one edge')
  assert.ok(
    cands.every((c) => c.author.kind === 'agent'),
    'every seed candidate is agent-authored',
  )
  assert.ok(
    cands.every((c) => c.provenance.state === 'pencil'),
    'every seed candidate is born pencil',
  )
  const nodeC = cands.find((c) => c.type === 'node.created')
  assert.ok(nodeC, 'a node.created is present')
})

// --- pendingPencil is empty for an empty / all-human log ----------------------

test('pendingPencil is empty for a log with no pencil elements', () => {
  const store = openStore()
  store.getState().dispatch(
    buildNodeCreatedCandidate(SESSION_ID, {
      id: 'n',
      type: 'Step',
      lane: 'r',
      label: 'x',
      zone: 2,
    }),
  )
  assert.equal(
    pendingPencil(store.getState().exportLog()).length,
    0,
    'no pencil items when everything is human ink',
  )
})
