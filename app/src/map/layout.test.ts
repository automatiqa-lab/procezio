// Layout acceptance test (spec 01b section 2, Zone 2): node columns follow the GLOBAL process
// flow, not a per-lane ordinal, so a hand-off across lanes is a short step and never a long
// diagonal. Pure and deterministic - no DOM, runs under `node --test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutNodes, laneWidth, LANE_LEFT, NODE_X_GAP } from './layout.js'
import type { Canvas } from '@procezio/schema'

// A flow that crosses lanes and comes back: start in lane A, hand off to lane B, run along B,
// then hand off to lane C. Under a per-lane ordinal the first node of each lane would share a
// column (a diagonal back-and-forth); under flow sequencing each successor sits one column past
// its predecessor.
const CANVAS = {
  schema_version: '1.2',
  process: { name: 'X' },
  lanes: [
    { id: 'a', actor: 'A' },
    { id: 'b', actor: 'B' },
    { id: 'c', actor: 'C' },
  ],
  nodes: [
    { id: 'n1', type: 'Start', lane: 'a', label: 'apply', zone: 2 },
    { id: 'n2', type: 'Step', lane: 'b', label: 'collect', zone: 2 },
    { id: 'n3', type: 'Step', lane: 'b', label: 'check', zone: 2 },
    { id: 'n4', type: 'Step', lane: 'c', label: 'credit', zone: 2 },
    { id: 'n5', type: 'End', lane: 'c', label: 'active', zone: 2 },
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2', kind: 'sequence' },
    { id: 'e2', from: 'n2', to: 'n3', kind: 'sequence' },
    { id: 'e3', from: 'n3', to: 'n4', kind: 'sequence' },
    { id: 'e4', from: 'n4', to: 'n5', kind: 'sequence' },
  ],
} as unknown as Canvas

test('columns follow the global flow: each node sits one column past its predecessor', () => {
  const col = new Map(layoutNodes(CANVAS).map((p) => [p.id, p.column]))
  assert.equal(col.get('n1'), 0, 'the start is column 0')
  assert.equal(col.get('n2'), 1, 'its successor is column 1 (not back at 0 for its lane)')
  assert.equal(col.get('n3'), 2)
  assert.equal(col.get('n4'), 3, 'a cross-lane hand-off keeps advancing the column')
  assert.equal(col.get('n5'), 4)
})

test('x follows the column and y follows the lane row', () => {
  const pos = new Map(layoutNodes(CANVAS).map((p) => [p.id, p]))
  assert.equal(pos.get('n2')!.x, LANE_LEFT + 1 * NODE_X_GAP, 'x is derived from the flow column')
  assert.equal(pos.get('n1')!.laneIndex, 0, 'lane A is row 0')
  assert.equal(pos.get('n4')!.laneIndex, 2, 'lane C is row 2')
})

test('no two nodes overlap: every (lane, column) cell is unique', () => {
  // Two isolated nodes in the same lane (no edges) would both want column 0; the collision
  // pass must push the second one right so they never render on top of each other.
  const canvas = {
    schema_version: '1.2',
    process: { name: 'X' },
    lanes: [{ id: 'a', actor: 'A' }],
    nodes: [
      { id: 'x1', type: 'Step', lane: 'a', label: 'one', zone: 2 },
      { id: 'x2', type: 'Step', lane: 'a', label: 'two', zone: 2 },
    ],
    edges: [],
  } as unknown as Canvas
  const cells = layoutNodes(canvas).map((p) => `${p.laneIndex}:${p.column}`)
  assert.equal(new Set(cells).size, cells.length, 'no (lane, column) cell is shared')
})

test('a cycle does not hang the layout and every node still gets a position', () => {
  const canvas = {
    schema_version: '1.2',
    process: { name: 'X' },
    lanes: [{ id: 'a', actor: 'A' }],
    nodes: [
      { id: 'c1', type: 'Step', lane: 'a', label: 'one', zone: 2 },
      { id: 'c2', type: 'Step', lane: 'a', label: 'two', zone: 2 },
    ],
    edges: [
      { id: 'e1', from: 'c1', to: 'c2', kind: 'sequence' },
      { id: 'e2', from: 'c2', to: 'c1', kind: 'sequence' },
    ],
  } as unknown as Canvas
  const pos = layoutNodes(canvas)
  assert.equal(pos.length, 2, 'both nodes are placed despite the cycle')
  assert.equal(
    new Set(pos.map((p) => `${p.laneIndex}:${p.column}`)).size,
    2,
    'and they do not overlap',
  )
})

test('laneWidth spans the rightmost column of the whole flow', () => {
  // The flow reaches column 4 (n5), so the band must be wide enough to hold it.
  assert.ok(laneWidth(CANVAS) >= LANE_LEFT + 4 * NODE_X_GAP, 'band holds the last column')
})
