// M2-11 acceptance test - the event builder + case logic of the Zone 8 (Business case) surface.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "buildCaseDraftedCandidate drafts a case through the M2-01 store: it lands in
//    canvas.cases keyed by opportunity_id (redraft replaces in place), every figure
//    carries a source_ref (traceability), and needsRedeploymentOwner flags a
//    capacity-release benefit with no owner (v0.3 A1) until an owner is named"
//
// Proves event -> (ajv) -> C9 projection (M2-AMD2 case fold) at the layer a Node gate
// CAN prove, including the two hard-rule invariants on the data: traceability (a figure
// without a source_ref is invalid) and the capacity-release flag. The rendered form is
// proved by the screenshot-verified criterion.
//
// Imports ONLY pure modules - never a .tsx or React - so it runs headless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BENEFIT_CLASSES,
  CONFIDENCE_LEVELS,
  FIGURE_KINDS,
  buildCaseDraftedCandidate,
  needsRedeploymentOwner,
  sourceOptions,
  type Figure,
} from './events.js'
import { buildNodeCreatedCandidate } from '../map/events.js'
import { buildFrictionPinnedCandidate } from '../friction/events.js'
import { newIdeaOpportunity, buildOpportunityCreatedCandidate } from '../ideation/events.js'
import { buildScoreCommittedCandidate } from '../prioritize/events.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { CasePayload, Node } from '@procezio/schema'

const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f6076'

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
    return `2026-07-08T13:${String(n).padStart(2, '0')}:00Z`
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

const casesOf = (store: ReturnType<typeof createCanvasStore>) =>
  getCanvas(store.getState()).cases ?? []

// --- The named acceptance test ------------------------------------------------

test('buildCaseDraftedCandidate drafts a case that lands in canvas.cases keyed by opportunity_id (redraft replaces in place), every figure carries a source_ref, and the capacity-release flag holds', () => {
  const OPP = 'op-auto-match'
  const store = openStore()
  store
    .getState()
    .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity(OPP, 'auto-match')))
  store
    .getState()
    .dispatch(buildScoreCommittedCandidate(SESSION_ID, OPP, { benefit: 5, effort: 2 }))
  // A step + friction so figures have real canvas sources to cite.
  const node: Node = { id: 'n-match', type: 'Step', lane: 'ap', label: 'Three-way match', zone: 2 }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, node))
  store.getState().dispatch(
    buildFrictionPinnedCandidate(SESSION_ID, {
      id: 'f-rework',
      waste: 'Defects',
      node_id: 'n-match',
      note: 'rework',
    }),
  )

  assert.equal(casesOf(store).length, 0, 'no case before drafting')

  const draft: CasePayload = {
    opportunity_id: OPP,
    figures: [
      { label: 'match rework', value: '~40 h/month', source_ref: 'f-rework', kind: 'cost' },
      {
        label: 'freed AP hours',
        value: '~30 h/month',
        source_ref: 'n-match',
        kind: 'benefit',
        benefit_class: 'capacity-release',
      },
    ],
    assumptions: [
      {
        statement: '30% mismatch rate',
        source: 'Zone 4',
        confidence: 'med',
        verify_by: 'pull the report',
      },
    ],
  }
  store.getState().dispatch(buildCaseDraftedCandidate(SESSION_ID, draft))

  let cases = casesOf(store)
  assert.equal(cases.length, 1, 'the draft lands in canvas.cases')
  assert.equal(cases[0]?.opportunity_id, OPP, 'the case is keyed to its opportunity')
  // Traceability: every figure carries a source_ref.
  assert.ok(
    cases[0]?.figures.every((f) => f.source_ref.length > 0),
    'every figure cites a source',
  )
  // v0.3 A1: the capacity-release benefit has no owner -> flagged.
  const freed = cases[0]!.figures.find((f) => f.benefit_class === 'capacity-release')!
  assert.equal(needsRedeploymentOwner(freed), true, 'capacity-release with no owner is flagged')

  // Redraft with an owner named -> replaces in place, flag clears.
  const draft2: CasePayload = {
    ...draft,
    figures: [draft.figures[0]!, { ...draft.figures[1]!, redeployment_owner: 'AP team lead' }],
  }
  store.getState().dispatch(buildCaseDraftedCandidate(SESSION_ID, draft2))
  cases = casesOf(store)
  assert.equal(cases.length, 1, 'a redraft upserts by opportunity_id - no second case')
  const freed2 = cases[0]!.figures.find((f) => f.benefit_class === 'capacity-release')!
  assert.equal(needsRedeploymentOwner(freed2), false, 'naming a redeployment owner clears the flag')
  assert.equal(getError(store.getState()), null, 'every valid case.drafted leaves lastError null')
})

// --- needsRedeploymentOwner only flags the capacity-release-without-owner case --

test('needsRedeploymentOwner flags only capacity-release benefits with no owner', () => {
  const hard: Figure = {
    label: 'license',
    value: '-5k',
    source_ref: 's',
    kind: 'benefit',
    benefit_class: 'hard-savings',
  }
  const capNoOwner: Figure = {
    label: 'hours',
    value: '30h',
    source_ref: 's',
    kind: 'benefit',
    benefit_class: 'capacity-release',
  }
  const capOwner: Figure = { ...capNoOwner, redeployment_owner: 'team lead' }
  const cost: Figure = { label: 'build', value: '10k', source_ref: 's', kind: 'cost' }
  assert.equal(needsRedeploymentOwner(hard), false, 'hard-savings is never flagged')
  assert.equal(
    needsRedeploymentOwner(capNoOwner),
    true,
    'capacity-release without owner is flagged',
  )
  assert.equal(needsRedeploymentOwner(capOwner), false, 'capacity-release with owner is clear')
  assert.equal(needsRedeploymentOwner(cost), false, 'a cost figure is never flagged')
})

// --- sourceOptions gathers citable canvas elements ----------------------------

test('sourceOptions lists steps, friction, and audit tags as citable sources', () => {
  const store = openStore()
  store.getState().dispatch(
    buildNodeCreatedCandidate(SESSION_ID, {
      id: 'n1',
      type: 'Step',
      lane: 'ap',
      label: 'Match',
      zone: 2,
    }),
  )
  store
    .getState()
    .dispatch(
      buildFrictionPinnedCandidate(SESSION_ID, { id: 'fr1', waste: 'Waiting', node_id: 'n1' }),
    )

  const opts = sourceOptions(getCanvas(store.getState()))
  const ids = opts.map((o) => o.id)
  assert.ok(ids.includes('n1'), 'a step is a citable source')
  assert.ok(ids.includes('fr1'), 'a friction is a citable source')
  assert.ok(
    opts.every((o) => o.label.length > 0),
    'every source has a human label',
  )
})

// --- The option lists match the schema unions ---------------------------------

test('the case option constants match the schema unions', () => {
  assert.deepEqual([...FIGURE_KINDS], ['cost', 'benefit'])
  assert.deepEqual([...BENEFIT_CLASSES], ['hard-savings', 'capacity-release', 'quality-speed'])
  assert.deepEqual([...CONFIDENCE_LEVELS], ['low', 'med', 'high'])
})
