// Overlap-resolver acceptance test (spec 01b section 2): resizing a frame must nudge only the
// neighbours it now overlaps, by the smallest push, keeping the anchor and every non-overlapping
// frame exactly where the user put them. Pure and deterministic - runs under `node --test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveFrameOverlaps, type FrameBox } from './geometry.js'

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0

test('a non-overlapping layout is left completely untouched', () => {
  const boxes: FrameBox[] = [
    { id: 'a', x: 0, y: 0, w: 100, h: 100 },
    { id: 'b', x: 200, y: 0, w: 100, h: 100 },
    { id: 'c', x: 0, y: 200, w: 100, h: 100 },
  ]
  const out = resolveFrameOverlaps(boxes, 'a', 24)
  assert.deepEqual(out['a'], { x: 0, y: 0 }, 'the anchor never moves')
  assert.deepEqual(out['b'], { x: 200, y: 0 }, 'a frame that overlaps nothing stays put')
  assert.deepEqual(out['c'], { x: 0, y: 200 })
})

test('a grown anchor pushes an overlapped right-hand neighbour to the right, not elsewhere', () => {
  // `a` grew to width 260 and now overlaps `b` (originally to its right). `b` should move right by
  // just enough to clear it (plus the gap), staying on the same row - never dropped somewhere new.
  const boxes: FrameBox[] = [
    { id: 'a', x: 0, y: 0, w: 260, h: 100 },
    { id: 'b', x: 200, y: 0, w: 100, h: 100 },
  ]
  const out = resolveFrameOverlaps(boxes, 'a', 24)
  assert.deepEqual(out['a'], { x: 0, y: 0 }, 'the resized frame stays fixed')
  assert.equal(out['b']!.y, 0, 'the neighbour stays on the same row (pushed sideways, not away)')
  assert.equal(out['b']!.x, 284, 'pushed right to clear the anchor (0+260) plus the 24 gap')
})

test('a frame directly below a grown anchor is pushed straight down', () => {
  const boxes: FrameBox[] = [
    { id: 'a', x: 0, y: 0, w: 200, h: 260 },
    { id: 'b', x: 0, y: 200, w: 200, h: 100 },
  ]
  const out = resolveFrameOverlaps(boxes, 'a', 24)
  assert.equal(out['b']!.x, 0, 'stays in its column')
  assert.equal(out['b']!.y, 284, 'pushed down to clear the anchor (0+260) plus the 24 gap')
})

test('a frame already overlapping the anchor BEFORE the resize is not disturbed by a 1px grow', () => {
  // `b` was deliberately parked over the anchor's left edge; the anchor then grew by a single
  // pixel. That overlap predates the resize, so it is none of the resize's business: `b` must
  // survive completely unmoved (the anchor's pre-resize rect identifies the pair as pre-existing).
  const boxes: FrameBox[] = [
    { id: 'a', x: 0, y: 0, w: 100, h: 100 },
    { id: 'b', x: -50, y: 20, w: 100, h: 50 },
  ]
  const out = resolveFrameOverlaps(boxes, 'a', 24, { x: 0, y: 0, w: 100, h: 99 })
  assert.deepEqual(out['a'], { x: 0, y: 0 }, 'the anchor never moves')
  assert.deepEqual(
    out['b'],
    { x: -50, y: 20 },
    'a pre-existing overlap survives the resize unmoved',
  )
})

test('a chained push can never leave a frame sitting inside the anchor', () => {
  // The verified failure case for the single-frontier flood: A pushes B right, B's push then
  // drops C DOWN - straight into A - and the flood terminates because the anchor is never
  // re-checked as an obstacle. The post-flood sweep must clear C off the anchor.
  const boxes: FrameBox[] = [
    { id: 'a', x: 0, y: 0, w: 100, h: 100 },
    { id: 'b', x: -40, y: -120, w: 100, h: 130 },
    { id: 'c', x: 60, y: -110, w: 100, h: 40 },
  ]
  const out = resolveFrameOverlaps(boxes, 'a', 28)
  assert.deepEqual(out['a'], { x: 0, y: 0 }, 'the anchor is fixed')
  const placed = boxes.map((b) => ({ ...b, x: out[b.id]!.x, y: out[b.id]!.y }))
  const anchor = placed.find((b) => b.id === 'a')!
  for (const o of placed) {
    if (o.id === 'a') continue
    assert.ok(!overlaps(anchor, o), `${o.id} must not end up overlapping the anchor`)
  }
})

test('the anchor pushes its overlapped neighbours clear, never upward, and leaves distant frames alone', () => {
  const boxes: FrameBox[] = [
    { id: 'map', x: 0, y: 0, w: 500, h: 400 }, // the grown anchor
    { id: 'r', x: 300, y: 40, w: 200, h: 150 }, // to the right, overlapping
    { id: 'd', x: 40, y: 300, w: 200, h: 150 }, // below, overlapping
    { id: 'far', x: 900, y: 900, w: 100, h: 100 }, // untouched
  ]
  const out = resolveFrameOverlaps(boxes, 'map', 24)
  const sized = boxes.map((b) => ({ ...b, x: out[b.id]!.x, y: out[b.id]!.y }))
  for (let i = 0; i < sized.length; i += 1)
    for (let j = i + 1; j < sized.length; j += 1)
      assert.ok(
        !overlaps(sized[i]!, sized[j]!),
        `${sized[i]!.id} and ${sized[j]!.id} must not overlap`,
      )
  assert.ok(out['r']!.y >= 40, 'the right neighbour is never shoved upward')
  assert.ok(out['r']!.x > 300, 'the right neighbour moves right, off the anchor')
  assert.ok(out['d']!.y > 300, 'the frame below moves down')
  assert.deepEqual(out['far'], { x: 900, y: 900 }, 'a distant frame is never disturbed')
  assert.deepEqual(out['map'], { x: 0, y: 0 }, 'the anchor is fixed')
})
