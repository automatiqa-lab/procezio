// M2-09 acceptance test - the event builders of the Zone 6 (Prioritize) surface.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "the Prioritize builders drive the two-stage convergence through the M2-01 store:
//    triage upserts the pile without a score, score.committed merges the 1-5 score and
//    marks the opportunity committed (never before), and quadrantFor derives the 2x2
//    placement from a committed score"
//
// This proves event -> (precompiled ajv validation) -> C9 projection at the layer a
// Node gate CAN prove, including the anti-anchoring INVARIANT on the data: an
// opportunity carries committed:true and a score ONLY after score.committed - triage
// alone never sets a score. The rendered ghost/commit affordances are proved by the
// screenshot-verified criterion.
//
// Imports ONLY pure modules - never a .tsx or React - so it runs headless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCORE_VALUES,
  TAXONOMY_RUNGS,
  TRIAGE_PILES,
  buildOpportunityUpsertCandidate,
  buildScoreCommittedCandidate,
  quadrantFor,
} from './events.js'
import { newIdeaOpportunity, buildOpportunityCreatedCandidate } from '../ideation/events.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { Opportunity, Score } from '@procezio/schema'

const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f6074'

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
    return `2026-07-08T11:${String(n).padStart(2, '0')}:00Z`
  }
}

/** A store with a live session and one titled candidate (from ideation). */
function openStoreWithIdea(id: string, title: string): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  store
    .getState()
    .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity(id, title)))
  return store
}

const only = (store: ReturnType<typeof createCanvasStore>, id: string): Opportunity | undefined =>
  (getCanvas(store.getState()).opportunities ?? []).find((o) => o.id === id)

// --- The named acceptance test ------------------------------------------------

test('the Prioritize builders drive the two-stage convergence: triage upserts the pile without a score, score.committed merges the score and marks committed (never before), and quadrantFor derives the 2x2 placement', () => {
  const ID = 'o-match-po'
  const store = openStoreWithIdea(ID, 'auto-match invoices to purchase orders')

  // Before any prioritize action: no triage, no score, not committed.
  let o = only(store, ID)!
  assert.equal(o.triage, undefined, 'a fresh candidate has no triage pile')
  assert.equal(o.score, undefined, 'a fresh candidate has no score')
  assert.equal(o.committed, undefined, 'a fresh candidate is not committed')

  // Stage 1 - Triage to Now. This upserts the pile and carries NO score: the
  // anti-anchoring separation on the data (triage never scores).
  store.getState().dispatch(buildOpportunityUpsertCandidate(SESSION_ID, o, { triage: 'Now' }))
  o = only(store, ID)!
  assert.equal(o.triage, 'Now', 'triage sets the Now pile')
  assert.equal(o.title, 'auto-match invoices to purchase orders', 'triage preserves the title')
  assert.equal(o.score, undefined, 'triage attaches NO score (still uncommitted)')
  assert.equal(o.committed, undefined, 'triage does not commit')

  // Set a rung (separate upsert) - still no score.
  store.getState().dispatch(buildOpportunityUpsertCandidate(SESSION_ID, o, { rung: 'Automate' }))
  o = only(store, ID)!
  assert.equal(o.rung, 'Automate', 'the taxonomy rung is set')
  assert.equal(o.committed, undefined, 'setting a rung does not commit a score')

  // Stage 2 - Commit the score. ONLY NOW is committed:true and a score present.
  const score: Score = { benefit: 5, effort: 2 }
  store.getState().dispatch(buildScoreCommittedCandidate(SESSION_ID, ID, score))
  o = only(store, ID)!
  assert.equal(o.committed, true, 'score.committed marks the opportunity committed')
  assert.deepEqual(o.score, { benefit: 5, effort: 2 }, 'the committed score is attached')
  assert.equal(o.triage, 'Now', 'commit preserves the triage pile')
  assert.equal(o.rung, 'Automate', 'commit preserves the rung')

  // Quadrant is DERIVED from the committed score: high benefit + low effort.
  assert.equal(quadrantFor(o.score!), 'Quick Win', 'benefit 5 / effort 2 derives a Quick Win')
  assert.equal(getError(store.getState()), null, 'every valid event leaves lastError null')
})

// --- quadrantFor covers all four cells ----------------------------------------

test('quadrantFor maps the 2x2 corners correctly (threshold above the midpoint)', () => {
  assert.equal(quadrantFor({ benefit: 5, effort: 1 }), 'Quick Win', 'high benefit, low effort')
  assert.equal(quadrantFor({ benefit: 5, effort: 5 }), 'Strategic', 'high benefit, high effort')
  assert.equal(quadrantFor({ benefit: 2, effort: 2 }), 'Fill-in', 'low benefit, low effort')
  assert.equal(quadrantFor({ benefit: 1, effort: 5 }), 'Avoid', 'low benefit, high effort')
  // Midpoint 3 is LOW on both axes (threshold is strictly above 3).
  assert.equal(quadrantFor({ benefit: 3, effort: 3 }), 'Fill-in', 'a 3/3 sits low-low')
  assert.equal(
    quadrantFor({ benefit: 4, effort: 3 }),
    'Quick Win',
    'benefit 4 is high, effort 3 is low',
  )
})

// --- Re-committing a score replaces the old one (still one opportunity) --------

test('re-committing a Now item replaces its score and re-derives the quadrant, without stacking', () => {
  const ID = 'o-1'
  const store = openStoreWithIdea(ID, 'idea')
  store
    .getState()
    .dispatch(buildOpportunityUpsertCandidate(SESSION_ID, only(store, ID)!, { triage: 'Now' }))

  store.getState().dispatch(buildScoreCommittedCandidate(SESSION_ID, ID, { benefit: 5, effort: 1 }))
  assert.equal(quadrantFor(only(store, ID)!.score!), 'Quick Win', 'first commit is a Quick Win')

  // Re-score to high effort: same single opportunity, new score, new quadrant.
  store.getState().dispatch(buildScoreCommittedCandidate(SESSION_ID, ID, { benefit: 5, effort: 5 }))
  const list = getCanvas(store.getState()).opportunities ?? []
  assert.equal(list.length, 1, 're-committing does not stack a second opportunity')
  assert.deepEqual(
    list[0]?.score,
    { benefit: 5, effort: 5 },
    'the re-committed score replaces the old one',
  )
  assert.equal(
    quadrantFor(list[0]!.score!),
    'Strategic',
    're-derived quadrant follows the new score',
  )
  assert.equal(getError(store.getState()), null, 'the re-commit leaves lastError null')
})

// --- Only the Now pile is scored (the surface reaches score only for Now) ------

test('triage piles and the constants match the spec (Now/Maybe/No, 1-5, six rungs)', () => {
  assert.deepEqual([...TRIAGE_PILES], ['Now', 'Maybe', 'No'])
  assert.deepEqual([...SCORE_VALUES], [1, 2, 3, 4, 5])
  assert.deepEqual(
    [...TAXONOMY_RUNGS],
    ['Remove', 'Standardize', 'Connect', 'Automate', 'Assist', 'Delegate'],
    'the six benefit-taxonomy rungs, least-to-most intervention',
  )

  // A Maybe/No item is never scored by this flow: assert the store accepts triage to
  // every pile and that a non-Now pile carries no committed score.
  const ID = 'o-x'
  const store = openStoreWithIdea(ID, 'idea')
  store
    .getState()
    .dispatch(buildOpportunityUpsertCandidate(SESSION_ID, only(store, ID)!, { triage: 'No' }))
  const o = only(store, ID)!
  assert.equal(o.triage, 'No', 'a candidate can be triaged to No')
  assert.equal(o.committed, undefined, 'a No-pile candidate is never committed by triage')
  assert.equal(getError(store.getState()), null, 'triage to any pile leaves lastError null')
})
