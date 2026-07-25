// v0.4 presentation-stream projection tests.
//
// Proves the second stream is (a) last-write-wins per element, (b) deterministic and folded
// in log order, and (c) genuinely disposable and separate - it produces geometry only and
// never depends on or emits methodology state.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectPresentation } from './presentation.js'
import type { PresentationEnvelope } from '@procezio/schema'

const UUID = '00000000-0000-4000-8000-000000000000'
let seq = 0
function ev(type: PresentationEnvelope['type'], payload: unknown): PresentationEnvelope {
  return {
    event_id: UUID,
    session_id: UUID,
    seq: seq++,
    type,
    payload: payload as PresentationEnvelope['payload'],
    ts: '2026-07-12T10:00:00.000Z',
  }
}

test('an empty stream projects empty geometry', () => {
  const state = projectPresentation([])
  assert.deepEqual(state.nodes, [])
  assert.deepEqual(state.frames, [])
})

test('node.moved records the last position (last-write-wins)', () => {
  seq = 0
  const state = projectPresentation([
    ev('node.moved', { node_id: 'n-1', position: { x: 10, y: 20 } }),
    ev('node.moved', { node_id: 'n-1', position: { x: 99, y: -5 } }),
    ev('node.moved', { node_id: 'n-2', position: { x: 0, y: 0 } }),
  ])
  const n1 = state.nodes?.find((n) => n.node_id === 'n-1')
  const n2 = state.nodes?.find((n) => n.node_id === 'n-2')
  assert.deepEqual(n1?.position, { x: 99, y: -5 }, 'the later move wins')
  assert.deepEqual(n2?.position, { x: 0, y: 0 })
  assert.equal(state.nodes?.length, 2)
})

test('frame geometry accumulates position, size, and collapsed independently', () => {
  seq = 0
  const state = projectPresentation([
    ev('frame.moved', { frame_id: 'zone-2', position: { x: 100, y: 100 } }),
    ev('frame.resized', { frame_id: 'zone-2', size: { w: 800, h: 600 } }),
    ev('frame.collapsed', { frame_id: 'zone-2', collapsed: true }),
    ev('frame.moved', { frame_id: 'zone-2', position: { x: 120, y: 100 } }),
  ])
  const f = state.frames?.find((x) => x.frame_id === 'zone-2')
  assert.deepEqual(f?.position, { x: 120, y: 100 }, 'a later move updates position only')
  assert.deepEqual(f?.size, { w: 800, h: 600 }, 'size survives the later move')
  assert.equal(f?.collapsed, true, 'collapsed survives the later move')
})

test('the fold is deterministic: the same log projects byte-identical state twice', () => {
  seq = 0
  const log = [
    ev('node.moved', { node_id: 'n-1', position: { x: 1, y: 2 } }),
    ev('frame.resized', { frame_id: 'shoebox', size: { w: 300, h: 200 } }),
    ev('node.moved', { node_id: 'n-2', position: { x: 3, y: 4 } }),
  ]
  const a = JSON.stringify(projectPresentation(log))
  const b = JSON.stringify(projectPresentation(log))
  assert.equal(a, b)
})

test('an unknown presentation type is a no-op, never a throw', () => {
  seq = 0
  const state = projectPresentation([
    ev('node.moved', { node_id: 'n-1', position: { x: 1, y: 2 } }),
    // A type a newer build might emit; an older fold must degrade gracefully.
    ev('camera.set' as PresentationEnvelope['type'], { x: 0, y: 0, zoom: 1 }),
  ])
  assert.equal(state.nodes?.length, 1, 'the known event still folds; the unknown is ignored')
})
