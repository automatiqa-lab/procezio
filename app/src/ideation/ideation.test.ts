// M2-08 acceptance test - the event-building helper of the Zone 5 (Ideation) surface.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "buildOpportunityCreatedCandidate builds a valid opportunity.created event that,
//    dispatched through the M2-01 store, appears in getCanvas().opportunities with the
//    title and NO judgment attached (no score, rung, triage, quadrant), proving the
//    divergent/convergent separation by construction"
//
// This proves the whole event -> (precompiled ajv validation) -> C9 projection ->
// what the view renders, at the layer a Node gate CAN prove. The rendered guarantee
// (no scoring affordances on the surface) is proved separately by the
// screenshot-verified criterion, since a headless Node test cannot observe a browser
// - but the DATA guarantee (a zone-5 candidate carries no judgment) is proved here.
//
// It imports ONLY pure modules - never a .tsx or React - so it runs headless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildOpportunityCreatedCandidate, newIdeaOpportunity } from './events.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { Opportunity } from '@procezio/schema'

const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f6073'

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
    return `2026-07-08T10:${String(n).padStart(2, '0')}:00Z`
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

// --- The named acceptance test ------------------------------------------------

test('buildOpportunityCreatedCandidate builds a valid opportunity.created event that, dispatched through the M2-01 store, appears in getCanvas().opportunities with the title and NO judgment attached (no score, rung, triage, quadrant)', () => {
  const store = openStore()
  assert.equal(
    (getCanvas(store.getState()).opportunities ?? []).length,
    0,
    'no candidates before any idea is added',
  )

  const idea: Opportunity = newIdeaOpportunity(
    'o-match-po',
    'auto-match invoices to purchase orders',
  )
  store.getState().dispatch(buildOpportunityCreatedCandidate(SESSION_ID, idea))

  const ideas = getCanvas(store.getState()).opportunities ?? []
  assert.equal(ideas.length, 1, 'exactly one candidate is generated')
  const projected = ideas[0]
  assert.equal(
    projected?.title,
    'auto-match invoices to purchase orders',
    'the title is carried through',
  )
  // Divergent/convergent separation, proved on the DATA: a zone-5 candidate carries
  // no judgment of any kind. These are the fields zone 6 (not zone 5) may set.
  assert.equal(projected?.score, undefined, 'no score is attached in ideation')
  assert.equal(projected?.rung, undefined, 'no taxonomy rung is attached in ideation')
  assert.equal(projected?.triage, undefined, 'no triage pile is attached in ideation')
  assert.equal(projected?.quadrant, undefined, 'no quadrant is attached in ideation')
  assert.equal(projected?.committed, undefined, 'nothing is committed in ideation')
  assert.equal(
    getError(store.getState()),
    null,
    'a valid opportunity.created leaves lastError null',
  )
})

// --- newIdeaOpportunity is judgment-free by construction ----------------------

test('newIdeaOpportunity yields an id+title-only Opportunity (no judgment keys)', () => {
  const o = newIdeaOpportunity('o-1', 'my idea')
  assert.deepEqual(
    Object.keys(o).sort(),
    ['id', 'title'],
    'only id and title are present on a fresh candidate',
  )
})

// --- Multiple ideas accumulate in insertion (event) order ---------------------

test('multiple ideas accumulate in event order and each keeps its own title', () => {
  const store = openStore()
  const titles = [
    'auto-match invoices to purchase orders',
    'route exceptions to a shared queue',
    'email suppliers when a PO is missing',
    'flag duplicate invoices before payment',
    'auto-close fully-received orders',
  ]
  titles.forEach((title, i) =>
    store
      .getState()
      .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity(`o-${i}`, title))),
  )

  const ideas = getCanvas(store.getState()).opportunities ?? []
  assert.equal(ideas.length, 5, 'all five candidates land (meets the >= 5 pass bar)')
  assert.deepEqual(
    ideas.map((o) => o.title),
    titles,
    'candidates keep event order, unranked',
  )
  assert.equal(getError(store.getState()), null, 'every valid candidate leaves lastError null')
})
