// C-TASK acceptance test - the LLM task layer (reword) + the tier unlock.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "rewordNudge returns the model's wording when it succeeds and falls back to the exact
//    template on failure (never changing the decision); and raising the store's tier via
//    setTier lets a tier-gated rule (the zone-6 challenge, T1) fire on the next commit -
//    with no LLM the challenge stays dormant"
//
// The model is a STUB LlmClient (no network), so this is deterministic under node --test.
// Rewording against a real endpoint is the user's to verify with BYO config.
//
// Imports ONLY pure modules - never a .tsx or React.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rewordNudge } from './reword.js'
import type { LlmClient } from '@procezio/core'
import { createCanvasStore } from '../store/canvas-store.js'
import { RULESET } from '../rules/ruleset.generated.js'
import { buildSessionStartedCandidate } from '../session.js'
import { newIdeaOpportunity, buildOpportunityCreatedCandidate } from '../ideation/events.js'
import { buildScoreCommittedCandidate } from '../prioritize/events.js'

const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f607b'

function idProvider(): () => string {
  let n = 0
  return () => `20000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`
}
function tsProvider(): () => string {
  let n = 0
  return () => `2026-07-09T13:${String((n += 1)).padStart(2, '0')}:00Z`
}

/** A stub client whose requestJson returns a fixed WordNudgeOutput (or fails). */
function stubClient(behavior: 'ok' | 'fail' | 'throw'): LlmClient {
  const metering = { model: 'stub', prompt_chars: 0, completion_chars: 0, attempts: 1, repairs: 0 }
  return {
    complete: async () => ({ text: '', metering }),
    requestJson: async () => {
      if (behavior === 'throw') throw new Error('network down')
      if (behavior === 'fail') return { ok: false as const, error: 'no valid json', metering }
      return {
        ok: true as const,
        value: { text: 'Have a quick look at your evidence before you lock this in.' } as never,
        metering,
      }
    },
    probe: async () => ({ tier: 'T2' as const, reachable: true }),
  }
}

// --- reword: success words it; any failure falls back to the template --------

test('rewordNudge returns the model wording on success', async () => {
  const text = await rewordNudge(stubClient('ok'), 'Commit your score first.')
  assert.equal(
    text,
    'Have a quick look at your evidence before you lock this in.',
    'the model wording is used',
  )
})

test('rewordNudge falls back to the exact template when the model returns no valid output', async () => {
  const template = 'At least one step has no system tagged.'
  assert.equal(
    await rewordNudge(stubClient('fail'), template),
    template,
    'invalid output -> template unchanged',
  )
})

test('rewordNudge falls back to the template when the transport throws', async () => {
  const template = 'A risk gate was checked.'
  assert.equal(
    await rewordNudge(stubClient('throw'), template),
    template,
    'a thrown error -> template unchanged',
  )
})

// --- tier unlock: setTier lets the zone-6 (T1) challenge fire -----------------

test('setTier raises the tier so the zone-6 challenge fires on the next commit', () => {
  const store = createCanvasStore({
    eventIdProvider: idProvider(),
    tsProvider: tsProvider(),
    ruleset: RULESET,
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'P2P'))
  store
    .getState()
    .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity('op-1', 'idea')))

  // At T0 (default), committing a score does NOT raise the zone-6 challenge.
  store
    .getState()
    .dispatch(buildScoreCommittedCandidate(SESSION_ID, 'op-1', { benefit: 5, effort: 2 }))
  assert.ok(
    !store.getState().nudges.some((n) => n.rule_id === 'zone6-anti-anchoring'),
    'the T1 challenge is dormant at T0',
  )

  // Connect a model -> raise the tier -> a fresh commit fires the challenge.
  store.getState().setTier('T2')
  assert.equal(store.getState().tier, 'T2', 'the store reflects the raised tier')
  store
    .getState()
    .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity('op-2', 'other')))
  store
    .getState()
    .dispatch(buildScoreCommittedCandidate(SESSION_ID, 'op-2', { benefit: 4, effort: 3 }))
  assert.ok(
    store.getState().nudges.some((n) => n.rule_id === 'zone6-anti-anchoring'),
    'raising the tier lets the challenge fire on the next commit',
  )
})
