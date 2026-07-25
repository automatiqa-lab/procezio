// Session-replay acceptance test (spec 01b Wave 3 F4): time-travel over the event log.
//
// Named criterion: "replayAt folds the first k events into a read-only summary; the counts grow
// monotonically as k advances; k is clamped into 1..total; the final frame equals the live canvas."
// Deterministic - it is core project() over a slice, so it never mutates and never fabricates.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createCanvasStore, getCanvas } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import { TEMPLATES } from '../templates/templates.generated.js'
import { templateToCandidates } from '../templates/template.js'
import { replayAt } from './replay.js'

function p2pLog() {
  const store = createCanvasStore({
    eventIdProvider: () => randomUUID(),
    tsProvider: () => '2026-07-12T00:00:00.000Z',
  })
  const sid = randomUUID()
  store.getState().dispatch(buildSessionStartedCandidate(sid, 'Purchase-to-Pay'))
  const p2p = TEMPLATES.find((t) => t.id === 'p2p')!
  for (const c of templateToCandidates(p2p, sid)) store.getState().dispatch(c)
  return { events: store.getState().exportLog(), canvas: getCanvas(store.getState()) }
}

test('replayAt grows the step counts as the scrubber advances', () => {
  const { events } = p2pLog()
  const early = replayAt(events, 3)
  const late = replayAt(events, events.length)
  assert.ok(late.nodes >= early.nodes, 'nodes accrue over the session')
  assert.ok(late.friction >= early.friction)
  assert.equal(late.step, events.length, 'the final frame is the whole log')
})

test('the final replay frame matches the live canvas', () => {
  const { events, canvas } = p2pLog()
  const final = replayAt(events, events.length)
  assert.equal(final.nodes, canvas.nodes.length)
  assert.equal(final.friction, (canvas.friction ?? []).length)
})

test('k is clamped into range and never throws', () => {
  const { events } = p2pLog()
  assert.equal(replayAt(events, 0).step, 1, 'below range clamps to 1')
  assert.equal(replayAt(events, 9999).step, events.length, 'above range clamps to total')
})

test('replayAt labels the last event that happened', () => {
  const { events } = p2pLog()
  assert.equal(replayAt(events, 1).lastEvent, 'session started', 'the first event is the session')
})
