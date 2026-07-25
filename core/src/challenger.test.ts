// challengeTier acceptance test - the escalation ladder is a pure, deterministic rung.
//
// Named criterion: "0 prior -> probe, 1 -> alert, 2+ -> challenge and never higher; a negative
// or fractional count cannot escalate below the first rung." The LLM never sees this decision.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { challengeTier, CHALLENGE_LADDER } from './challenger.js'

test('the ladder climbs probe -> alert -> challenge and then stays', () => {
  assert.equal(challengeTier(0), 'probe', 'the first challenge is the gentle probe')
  assert.equal(challengeTier(1), 'alert', 'the second is firmer')
  assert.equal(challengeTier(2), 'challenge', 'the third is direct')
  assert.equal(challengeTier(3), 'challenge', 'and it never climbs past challenge')
  assert.equal(challengeTier(99), 'challenge')
})

test('a negative or fractional prior count clamps to the first rung / floors', () => {
  assert.equal(challengeTier(-5), 'probe', 'cannot escalate below the first rung')
  assert.equal(challengeTier(0.9), 'probe', 'a fraction floors, not rounds')
  assert.equal(challengeTier(1.9), 'alert')
})

test('CHALLENGE_LADDER is the three rungs, gentlest first', () => {
  assert.deepEqual([...CHALLENGE_LADDER], ['probe', 'alert', 'challenge'])
})
