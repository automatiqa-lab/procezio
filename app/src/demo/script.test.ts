// Keyless demo acceptance test (spec 01b section 13, N1 - the launch gate).
//
// Named criterion: "replaying the demo script into a fresh session with NO model produces a real
// canvas that reaches a committed idea, a woken Challenger with an evidence-cited challenge, and a
// drafted improvement case - the whole loop, keyless." Every candidate must be accepted by the
// store against the ratified contract; nothing is a mock.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import { demoScript } from './script.js'

function freshStore() {
  return createCanvasStore({
    eventIdProvider: () => randomUUID(),
    tsProvider: () => '2026-07-12T00:00:00.000Z',
  })
}

test('the demo replays keyless into a real canvas reaching challenge + case', () => {
  const store = freshStore()
  const sid = randomUUID()
  store.getState().dispatch(buildSessionStartedCandidate(sid, 'Purchase-to-Pay'))
  const steps = demoScript(sid)

  for (const step of steps) {
    for (const c of step.candidates) {
      store.getState().dispatch(c)
      assert.equal(getError(store.getState()), null, `store accepted: ${step.caption}`)
    }
  }

  const canvas = getCanvas(store.getState())
  assert.ok(canvas.nodes.length >= 8, 'the process map is populated from the template')
  const committed = (canvas.opportunities ?? []).filter((o) => o.committed === true)
  assert.equal(committed.length, 1, 'exactly one committed idea')
  assert.ok(committed[0]!.score, 'it carries a score')
  assert.ok((canvas.cases ?? []).length >= 1, 'an improvement case is drafted')
})

test('exactly one beat wakes the Challenger, and it cites real canvas ids', () => {
  const steps = demoScript(randomUUID())
  const challengeBeats = steps.filter((s) => s.challenge)
  assert.equal(challengeBeats.length, 1, 'one challenge beat')
  const ch = challengeBeats[0]!.challenge!
  assert.ok(ch.cited_refs.length >= 1, 'the challenge cites evidence (the evidence line)')
  assert.ok(ch.cited_refs.includes('p2p-match'), 'it cites the three-way match step')
})

test('the demo is under a dozen beats (a <3-minute story)', () => {
  const steps = demoScript(randomUUID())
  assert.ok(steps.length > 0 && steps.length <= 12, 'a tight, watchable script')
  // The challenge beat comes after the commitment beat (anti-anchoring order).
  const commitIdx = steps.findIndex((s) => s.candidates.some((c) => c.type === 'commitment'))
  const challengeIdx = steps.findIndex((s) => s.challenge)
  assert.ok(
    commitIdx >= 0 && challengeIdx > commitIdx,
    'the Challenger wakes only after the commit',
  )
})
