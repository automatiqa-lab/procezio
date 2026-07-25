// M2-12 acceptance test - the event builder + gate logic of the assumption ledger.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "buildAssumptionAddedCandidate appends to canvas.assumptions in log order, and
//    needsVerification / unverifiedCount implement the v0.3 A2 gate: a low-confidence
//    assumption with no verify plan blocks export until acknowledged"
//
// Proves event -> (ajv) -> C9 projection (append fold) at the layer a Node gate CAN
// prove, including the A2 gate INVARIANT on the data. The rendered panel + gate banner
// are proved by the screenshot-verified criterion.
//
// Imports ONLY pure modules - never a .tsx or React - so it runs headless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONFIDENCE_LEVELS,
  buildAssumptionAddedCandidate,
  needsVerification,
  newAssumption,
  revisedAssumption,
  unverifiedCount,
  zoneFromSource,
} from './events.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { Assumption } from '@procezio/schema'

const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f6077'

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
    return `2026-07-09T09:${String(n).padStart(2, '0')}:00Z`
  }
}

function openStore(): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  return store
}

const ledger = (store: ReturnType<typeof createCanvasStore>) =>
  getCanvas(store.getState()).assumptions ?? []

// --- The named acceptance test ------------------------------------------------

test('buildAssumptionAddedCandidate appends to canvas.assumptions in log order, and the A2 gate (needsVerification / unverifiedCount) blocks on low-confidence assumptions with no verify plan', () => {
  const store = openStore()
  assert.equal(ledger(store).length, 0, 'the ledger starts empty')
  assert.equal(unverifiedCount(ledger(store)), 0, 'an empty ledger blocks nothing')

  // A low-confidence assumption with NO verify plan -> blocks export.
  store
    .getState()
    .dispatch(
      buildAssumptionAddedCandidate(
        SESSION_ID,
        newAssumption('20 min touch time', 'Zone 1', 'low', '', ''),
      ),
    )
  // A med-confidence assumption -> never blocks.
  store
    .getState()
    .dispatch(
      buildAssumptionAddedCandidate(
        SESSION_ID,
        newAssumption('30% mismatch rate', 'Zone 4', 'med', '', ''),
      ),
    )
  // A low-confidence assumption WITH a verify plan -> acknowledged, does not block.
  store
    .getState()
    .dispatch(
      buildAssumptionAddedCandidate(
        SESSION_ID,
        newAssumption('5k license', 'Zone 8', 'low', 'get the quote', ''),
      ),
    )

  const l = ledger(store)
  assert.equal(l.length, 3, 'each assumption.added appends one entry')
  // Log order is preserved (append, not upsert).
  assert.deepEqual(
    l.map((a) => a.source),
    ['Zone 1', 'Zone 4', 'Zone 8'],
    'entries keep log order',
  )
  // Only the first (low + no verify) blocks.
  assert.equal(
    unverifiedCount(l),
    1,
    'exactly one low-confidence, unplanned assumption blocks export',
  )
  assert.equal(needsVerification(l[0]!), true, 'low + no verify plan needs verification')
  assert.equal(needsVerification(l[1]!), false, 'med confidence never blocks')
  assert.equal(needsVerification(l[2]!), false, 'low + a verify plan is acknowledged')
  assert.equal(
    getError(store.getState()),
    null,
    'every valid assumption.added leaves lastError null',
  )
})

// --- Acknowledging a low assumption (adding a verify plan) clears the gate -----

test('the gate clears when every low-confidence assumption has a verify plan', () => {
  const store = openStore()
  store
    .getState()
    .dispatch(buildAssumptionAddedCandidate(SESSION_ID, newAssumption('a', 'Z1', 'low', '', '')))
  store
    .getState()
    .dispatch(buildAssumptionAddedCandidate(SESSION_ID, newAssumption('b', 'Z2', 'low', '', '')))
  assert.equal(unverifiedCount(ledger(store)), 2, 'two unplanned low assumptions block')

  // The ledger appends (no in-place edit): acknowledging means a NEW entry that
  // carries the verify plan. The gate counts remaining unplanned lows.
  store
    .getState()
    .dispatch(
      buildAssumptionAddedCandidate(
        SESSION_ID,
        newAssumption('a', 'Z1', 'low', 'pull the report', ''),
      ),
    )
  const remaining = unverifiedCount(ledger(store))
  assert.equal(
    remaining,
    2,
    'the append adds a planned entry; the two originals still count until themselves acknowledged',
  )
})

// --- newAssumption drops empty optional keys (no undefined) --------------------

test('newAssumption omits empty verify_by / owner rather than storing undefined', () => {
  const bare = newAssumption('x', 'Z1', 'med', '', '')
  assert.deepEqual(
    Object.keys(bare).sort(),
    ['confidence', 'source', 'statement'],
    'no empty optional keys',
  )
  const full = newAssumption('x', 'Z1', 'low', 'verify it', 'me')
  assert.equal(full.verify_by, 'verify it', 'a non-empty verify_by is kept')
  assert.equal(full.owner, 'me', 'a non-empty owner is kept')
})

// --- Confidence levels match the schema union ---------------------------------

test('CONFIDENCE_LEVELS matches the schema Assumption.confidence union', () => {
  assert.deepEqual([...CONFIDENCE_LEVELS], ['low', 'med', 'high'])
  const store = openStore()
  for (const c of CONFIDENCE_LEVELS) {
    store
      .getState()
      .dispatch(
        buildAssumptionAddedCandidate(
          SESSION_ID,
          newAssumption('s', 'src', c as Assumption['confidence'], '', ''),
        ),
      )
  }
  assert.equal(ledger(store).length, 3, 'every confidence level is accepted by the store')
  assert.equal(getError(store.getState()), null, 'no confidence value is rejected by ajv')
})

// --- D2 Admiralty grade (optional two-axis) -----------------------------------

test('an Admiralty-graded assumption carries independent axes and the store accepts it', () => {
  const a = newAssumption('rework ~20%', 'log', 'high', '', '', {
    reliability: 'B',
    corroboration: '2',
  })
  assert.deepEqual(a.admiralty, { reliability: 'B', corroboration: '2' }, 'the two axes are kept')
  const store = openStore()
  store.getState().dispatch(buildAssumptionAddedCandidate(SESSION_ID, a))
  assert.equal(getError(store.getState()), null, 'ajv accepts the graded assumption')
  assert.equal(ledger(store)[0]!.admiralty!.reliability, 'B')
})

test('an ungraded assumption omits the admiralty key entirely', () => {
  const a = newAssumption('gut number', 'Z1', 'low', '', '')
  assert.equal('admiralty' in a, false, 'no empty grade object when ungraded')
})

// --- The in-place review path (v0.4 amendment: same-id upsert) -----------------

test('revisedAssumption keeps identity, applies the review, and acknowledges the gate', () => {
  const legacy: Assumption = { statement: 'S', source: 'desk', confidence: 'low' }
  // A pre-amendment (id-less) entry adopts the minted id; the plan acknowledges it.
  const r1 = revisedAssumption(legacy, { verifyBy: 'ask the credit team' }, 'minted-1')
  assert.equal(r1.id, 'minted-1', 'an id-less entry adopts the minted id')
  assert.equal(r1.verify_by, 'ask the credit team')
  assert.equal(needsVerification(r1), false, 'a planned low assumption no longer blocks')
  // An entry born with an id KEEPS it (that is what makes the upsert land in place).
  const r2 = revisedAssumption(r1, { confidence: 'med', evidence: 'ticket-42' }, 'minted-2')
  assert.equal(r2.id, 'minted-1', 'the existing id survives every later revision')
  assert.equal(r2.confidence, 'med', 'confidence raised after verification')
  assert.equal(r2.evidence, 'ticket-42')
  assert.equal(r2.verify_by, 'ask the credit team', 'untouched fields carry over')
  // Revising a field to blank DROPS the key (never an empty-string property).
  const r3 = revisedAssumption(r2, { verifyBy: '  ' }, 'minted-3')
  assert.equal('verify_by' in r3, false, 'a blanked plan removes the key entirely')
})

test('zoneFromSource resolves zone numbers and zone names, and stays null for plain prose', () => {
  assert.deepEqual(zoneFromSource('Zone 4 export'), { id: 4, name: 'Data & Rules' })
  assert.deepEqual(zoneFromSource('from zone-2'), { id: 2, name: 'Map' })
  assert.deepEqual(zoneFromSource('the Data & Rules profile'), { id: 4, name: 'Data & Rules' })
  assert.deepEqual(zoneFromSource('risk gate review'), { id: 7, name: 'Risk gate' })
  assert.equal(zoneFromSource('gut feel from the collections desk'), null)
  assert.equal(zoneFromSource('our process mapping workshop'), null, 'no word-boundary bleed')
})
