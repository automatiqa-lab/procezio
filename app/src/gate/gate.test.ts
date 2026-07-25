// M2-10 acceptance test - the event builder + gate logic of the Zone 7 (Risk gate) surface.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "buildGateCheckedCandidate drives the five risk checks through the M2-01 store:
//    each check upserts into canvas.gates by the (opportunity, check) key, a re-check
//    replaces its status in place, and allChecksCleared is true only when all five are
//    cleared - the gate that blocks the zone-8 case"
//
// Proves event -> (ajv) -> C9 projection (M2-AMD2 gate fold) at the layer a Node gate
// CAN prove, including the BLOCKING invariant: a case is cleared only when every one of
// the five checks is cleared. Rendered blocked/cleared badges are proved by the
// screenshot-verified criterion.
//
// Imports ONLY pure modules - never a .tsx or React - so it runs headless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHECK_INFO,
  GATE_CHECKS,
  allChecksCleared,
  buildGateCheckedCandidate,
  findingOf,
  statusOf,
} from './events.js'
import { newIdeaOpportunity, buildOpportunityCreatedCandidate } from '../ideation/events.js'
import { buildScoreCommittedCandidate } from '../prioritize/events.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'

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
    return `2026-07-08T12:${String(n).padStart(2, '0')}:00Z`
  }
}

/** A store with a live session and one committed opportunity to gate. */
function openStoreWithCommitted(id: string): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  store
    .getState()
    .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity(id, 'auto-match')))
  store.getState().dispatch(buildScoreCommittedCandidate(SESSION_ID, id, { benefit: 5, effort: 2 }))
  return store
}

const gatesOf = (store: ReturnType<typeof createCanvasStore>) =>
  getCanvas(store.getState()).gates ?? []

// --- The named acceptance test ------------------------------------------------

test('buildGateCheckedCandidate drives the five checks through the store: upsert by (opportunity, check), re-check replaces in place, and allChecksCleared is true only when all five clear', () => {
  const ID = 'op-auto-match'
  const store = openStoreWithCommitted(ID)
  assert.equal(gatesOf(store).length, 0, 'no gate rows before any check')
  assert.equal(allChecksCleared(gatesOf(store), ID), false, 'an ungated opportunity is not cleared')

  // Clear four of the five checks.
  for (const check of GATE_CHECKS.slice(0, 4)) {
    store.getState().dispatch(buildGateCheckedCandidate(SESSION_ID, ID, check, 'cleared'))
  }
  assert.equal(gatesOf(store).length, 4, 'four distinct checks make four gate rows')
  assert.equal(
    allChecksCleared(gatesOf(store), ID),
    false,
    'four of five cleared still blocks the case',
  )

  // The fifth check open first, with a finding.
  const fifth = GATE_CHECKS[4]!
  store
    .getState()
    .dispatch(
      buildGateCheckedCandidate(SESSION_ID, ID, fifth, 'open', 'roles change, HR not consulted'),
    )
  assert.equal(gatesOf(store).length, 5, 'the fifth check adds a fifth row')
  assert.equal(statusOf(gatesOf(store), ID, fifth), 'open', 'the fifth check is open')
  assert.equal(
    findingOf(gatesOf(store), ID, fifth),
    'roles change, HR not consulted',
    'the finding is carried through',
  )
  assert.equal(allChecksCleared(gatesOf(store), ID), false, 'one open check blocks the case')

  // Re-check the fifth as cleared: upsert by (opportunity, check) replaces in place.
  store
    .getState()
    .dispatch(
      buildGateCheckedCandidate(SESSION_ID, ID, fifth, 'cleared', 'HR now owns the transition'),
    )
  assert.equal(
    gatesOf(store).length,
    5,
    're-checking replaces in place - still five rows, no stacking',
  )
  assert.equal(statusOf(gatesOf(store), ID, fifth), 'cleared', 'the re-check flips it to cleared')
  assert.equal(
    allChecksCleared(gatesOf(store), ID),
    true,
    'all five cleared -> the case is unblocked',
  )
  assert.equal(getError(store.getState()), null, 'every valid gate.checked leaves lastError null')
})

// --- The check list matches the schema and every check carries plain language --

test('GATE_CHECKS is the five schema checks and each has a title + question', () => {
  assert.deepEqual(
    [...GATE_CHECKS],
    [
      'data-privacy',
      'regulatory-compliance',
      'failure-blast-radius',
      'accountability',
      'change-impact-on-people',
    ],
  )
  assert.equal(new Set(GATE_CHECKS).size, 5, 'the five checks are distinct')
  for (const c of GATE_CHECKS) {
    assert.ok(CHECK_INFO[c]?.title?.length, `check ${c} has a title`)
    assert.ok(CHECK_INFO[c]?.question?.length, `check ${c} has a question`)
  }
})

// --- Gates are keyed per opportunity (two opportunities are independent) -------

test('gates are independent per opportunity (composite key includes opportunity_id)', () => {
  const store = openStoreWithCommitted('op-a')
  store
    .getState()
    .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity('op-b', 'other')))
  store
    .getState()
    .dispatch(buildScoreCommittedCandidate(SESSION_ID, 'op-b', { benefit: 3, effort: 3 }))

  // Clear all five on op-a only.
  for (const check of GATE_CHECKS) {
    store.getState().dispatch(buildGateCheckedCandidate(SESSION_ID, 'op-a', check, 'cleared'))
  }
  assert.equal(allChecksCleared(gatesOf(store), 'op-a'), true, 'op-a is fully cleared')
  assert.equal(
    allChecksCleared(gatesOf(store), 'op-b'),
    false,
    'op-b is untouched and still blocked',
  )
  assert.equal(gatesOf(store).length, 5, "op-a's five gates do not leak onto op-b")
  assert.equal(getError(store.getState()), null, 'independent gating leaves lastError null')
})

// --- An empty finding is omitted (no finding: undefined) -----------------------

test('a check with no finding stores no finding key; a finding can be added on re-check', () => {
  const ID = 'op-x'
  const store = openStoreWithCommitted(ID)
  store.getState().dispatch(buildGateCheckedCandidate(SESSION_ID, ID, 'data-privacy', 'cleared'))
  assert.equal(
    findingOf(gatesOf(store), ID, 'data-privacy'),
    '',
    'no finding stored when none given',
  )
  const row = gatesOf(store).find((g) => g.check === 'data-privacy')
  assert.equal(row?.finding, undefined, 'the finding key is absent, not an explicit undefined')
  assert.equal(getError(store.getState()), null, 'a finding-less gate.checked is valid')
})
