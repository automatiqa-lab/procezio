// Test for prioritize/model.ts - the pure derivation half of the Zone 6 (Prioritize)
// surface, extracted from PrioritizeZone.tsx so it is provable headless.
//
// Covers the two-stage-convergence derivations on plain schema values and through a
// REAL M2-01 store: only the Now pile is scoreable (nowPileOf), the shortlist health
// counts committed scores only (committedCountOf / isHealthyShortlist), the commit
// door opens only on a complete draft (completedScore - an incomplete draft can never
// fire score.committed), Re-commit stays disabled while the draft matches the
// committed score (isScoreDirty), and an unchanged triage-reason blur writes nothing
// (triageReasonPatch).
//
// Imports ONLY pure modules - never a .tsx or React - so it runs headless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHORTLIST_TARGET,
  committedCountOf,
  completedScore,
  isHealthyShortlist,
  isScoreDirty,
  nowPileOf,
  triageReasonPatch,
} from './model.js'
import { buildOpportunityUpsertCandidate, buildScoreCommittedCandidate } from './events.js'
import { newIdeaOpportunity, buildOpportunityCreatedCandidate } from '../ideation/events.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { Opportunity } from '@procezio/schema'

const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f6075'

function makeIdProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  }
}
function makeTsProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `2026-07-19T10:${String(n).padStart(2, '0')}:00Z`
  }
}

// --- nowPileOf + committedCountOf over a real projected canvas -----------------

test('nowPileOf keeps only the Now pile and committedCountOf counts its committed scores', () => {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  for (const [id, title] of [
    ['o-a', 'idea A'],
    ['o-b', 'idea B'],
    ['o-c', 'idea C'],
  ] as const) {
    store
      .getState()
      .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity(id, title)))
  }
  const opps = (): readonly Opportunity[] => getCanvas(store.getState()).opportunities ?? []

  assert.deepEqual(nowPileOf(opps()), [], 'untriaged candidates are not in the Now pile')

  // Triage: two to Now, one to Maybe. Only the Now pair is scoreable.
  const byId = (id: string): Opportunity => opps().find((o) => o.id === id)!
  store
    .getState()
    .dispatch(buildOpportunityUpsertCandidate(SESSION_ID, byId('o-a'), { triage: 'Now' }))
  store
    .getState()
    .dispatch(buildOpportunityUpsertCandidate(SESSION_ID, byId('o-b'), { triage: 'Now' }))
  store
    .getState()
    .dispatch(buildOpportunityUpsertCandidate(SESSION_ID, byId('o-c'), { triage: 'Maybe' }))
  assert.deepEqual(
    nowPileOf(opps()).map((o) => o.id),
    ['o-a', 'o-b'],
    'only Now-triaged candidates reach the score cards',
  )

  // One commit: the shortlist count follows committed scores, not triage.
  assert.equal(committedCountOf(nowPileOf(opps())), 0, 'triage alone commits nothing')
  store
    .getState()
    .dispatch(buildScoreCommittedCandidate(SESSION_ID, 'o-a', { benefit: 4, effort: 2 }))
  assert.equal(committedCountOf(nowPileOf(opps())), 1, 'one committed score counts as one')
  assert.equal(getError(store.getState()), null, 'every dispatch left lastError null')
})

// --- isHealthyShortlist: guidance threshold at the target ----------------------

test('isHealthyShortlist turns healthy exactly at the shortlist target', () => {
  assert.equal(SHORTLIST_TARGET, 3, 'the shortlist target is three committed scores')
  assert.equal(isHealthyShortlist(0), false, 'zero committed is not healthy')
  assert.equal(isHealthyShortlist(SHORTLIST_TARGET - 1), false, 'one short is not healthy')
  assert.equal(isHealthyShortlist(SHORTLIST_TARGET), true, 'at the target is healthy')
  assert.equal(isHealthyShortlist(SHORTLIST_TARGET + 2), true, 'past the target stays healthy')
})

// --- triageReasonPatch: only a real change writes a journal event --------------

test('triageReasonPatch trims and returns null when the blur changes nothing', () => {
  const bare: Opportunity = { id: 'o-1', title: 'idea' }
  assert.equal(triageReasonPatch(bare, '  '), null, 'a blank blur over no reason writes nothing')
  assert.equal(triageReasonPatch(bare, ' too risky '), 'too risky', 'a first reason is trimmed')

  const reasoned: Opportunity = { ...bare, triage_reason: 'too risky' }
  assert.equal(triageReasonPatch(reasoned, 'too risky'), null, 'an unchanged reason writes nothing')
  assert.equal(
    triageReasonPatch(reasoned, '  too risky  '),
    null,
    'whitespace around the same reason is still no change',
  )
  assert.equal(triageReasonPatch(reasoned, 'quick win'), 'quick win', 'a new reason is written')
  assert.equal(triageReasonPatch(reasoned, ''), '', 'clearing an existing reason IS a change')
})

// --- completedScore: the only door to Commit -----------------------------------

test('completedScore returns null until both axes are set', () => {
  assert.equal(completedScore(null, null), null, 'no axis set, no committable score')
  assert.equal(completedScore(4, null), null, 'benefit alone is not committable')
  assert.equal(completedScore(null, 2), null, 'effort alone is not committable')
  assert.deepEqual(completedScore(4, 2), { benefit: 4, effort: 2 }, 'both axes make the Score')
})

// --- isScoreDirty: Commit/Re-commit enablement ---------------------------------

test('isScoreDirty is true for any uncommitted draft and only on a moved axis once committed', () => {
  const ghost: Opportunity = { id: 'o-1', title: 'idea', triage: 'Now' }
  assert.equal(isScoreDirty(ghost, null, null), true, 'an uncommitted candidate is always dirty')
  assert.equal(isScoreDirty(ghost, 4, 2), true, 'even a complete draft is dirty pre-commit')

  const committed: Opportunity = { ...ghost, committed: true, score: { benefit: 4, effort: 2 } }
  assert.equal(
    isScoreDirty(committed, 4, 2),
    false,
    'a draft matching the committed score is clean',
  )
  assert.equal(isScoreDirty(committed, 5, 2), true, 'a moved benefit re-enables Re-commit')
  assert.equal(isScoreDirty(committed, 4, 3), true, 'a moved effort re-enables Re-commit')
})
