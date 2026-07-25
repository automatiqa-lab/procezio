// Test for case/model.ts - the pure derivation half of the Zone 8 (Improvement case)
// surface, extracted from CaseZone.tsx so it is provable headless.
//
// Covers the canvas-derived selectors (committed shortlist, gate-driven case status
// and eligibility, saved-draft lookup, agent-draft canvas assembly) through a REAL
// M2-01 store fed by the zone event builders, and the draft-level helpers (validity,
// normalization, split, dirty check) on plain schema values - including the two hard
// rules the helpers carry: traceability (no source_ref, no figure) and v0.3 A1 (a
// capacity-release benefit carries a redeployment owner only when one is named).
//
// Imports ONLY pure modules - never a .tsx or React - so it runs headless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assembleCanvasData,
  caseStatusFor,
  clearedChecks,
  committedOpportunities,
  draftInputsFingerprint,
  emptyAssumption,
  emptyFigure,
  finalizeAssumption,
  finalizeFigure,
  isAssumptionDraftValid,
  isCaseDirty,
  isCaseEligible,
  isFigureDraftValid,
  savedCaseFor,
  splitFigures,
} from './model.js'
import { buildCaseDraftedCandidate, type Figure } from './events.js'
import { buildNodeCreatedCandidate } from '../map/events.js'
import { buildFrictionPinnedCandidate } from '../friction/events.js'
import { buildAuditTagSetCandidate } from '../data/events.js'
import { buildAssumptionAddedCandidate } from '../assumptions/events.js'
import { buildFrameSetCandidate } from '../frame/frame.js'
import { GATE_CHECKS, buildGateCheckedCandidate } from '../gate/events.js'
import { newIdeaOpportunity, buildOpportunityCreatedCandidate } from '../ideation/events.js'
import { buildScoreCommittedCandidate } from '../prioritize/events.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { Assumption, CasePayload } from '@procezio/schema'

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
    return `2026-07-19T09:${String(n).padStart(2, '0')}:00Z`
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

const canvasOf = (store: ReturnType<typeof createCanvasStore>) => getCanvas(store.getState())

/** A store with one committed opportunity (the zone's entry ticket). */
function openStoreWithCommitted(id: string, title: string): ReturnType<typeof createCanvasStore> {
  const store = openStore()
  store
    .getState()
    .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity(id, title)))
  store.getState().dispatch(buildScoreCommittedCandidate(SESSION_ID, id, { benefit: 4, effort: 2 }))
  return store
}

// --- committedOpportunities: only the anti-anchoring commit opens the zone -----

test('committedOpportunities keeps only opportunities with a committed score', () => {
  const store = openStore()
  store
    .getState()
    .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity('o-a', 'idea A')))
  store
    .getState()
    .dispatch(buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity('o-b', 'idea B')))
  assert.deepEqual(committedOpportunities(canvasOf(store)), [], 'no commits, empty shortlist')

  store
    .getState()
    .dispatch(buildScoreCommittedCandidate(SESSION_ID, 'o-a', { benefit: 5, effort: 2 }))
  const shortlist = committedOpportunities(canvasOf(store))
  assert.equal(shortlist.length, 1, 'only the committed opportunity is shortlisted')
  assert.equal(shortlist[0]?.id, 'o-a', 'the committed one is o-a')
  assert.equal(getError(store.getState()), null, 'every dispatch left lastError null')
})

// --- caseStatusFor / isCaseEligible: the zone-7 gate blocks the case ----------

test('caseStatusFor walks blocked -> cleared -> drafted as the gate clears and a draft lands', () => {
  const OPP = 'o-match'
  const store = openStoreWithCommitted(OPP, 'auto-match')

  // No gate rows yet: the gate starts closed, so the case is blocked.
  assert.equal(caseStatusFor(canvasOf(store), OPP), 'blocked', 'unchecked gate blocks the case')
  assert.equal(isCaseEligible(canvasOf(store), OPP), false, 'blocked means not eligible')

  // Clear four of the five checks - one open check still blocks (all five must clear).
  for (const check of GATE_CHECKS.slice(0, 4))
    store.getState().dispatch(buildGateCheckedCandidate(SESSION_ID, OPP, check, 'cleared'))
  assert.equal(caseStatusFor(canvasOf(store), OPP), 'blocked', 'four of five is still blocked')

  // Clear the fifth: the gate opens, and with no draft yet the status is cleared.
  store.getState().dispatch(buildGateCheckedCandidate(SESSION_ID, OPP, GATE_CHECKS[4], 'cleared'))
  assert.equal(caseStatusFor(canvasOf(store), OPP), 'cleared', 'all five cleared, no draft yet')
  assert.equal(isCaseEligible(canvasOf(store), OPP), true, 'a cleared gate makes it eligible')

  // A saved draft flips the status to drafted.
  const draft: CasePayload = { opportunity_id: OPP, figures: [], assumptions: [] }
  store.getState().dispatch(buildCaseDraftedCandidate(SESSION_ID, draft))
  assert.equal(caseStatusFor(canvasOf(store), OPP), 'drafted', 'a saved draft reads drafted')
  assert.equal(getError(store.getState()), null, 'every dispatch left lastError null')
})

// --- savedCaseFor: the C9 upsert keyed by opportunity_id ----------------------

test('savedCaseFor finds the draft by opportunity_id and returns null otherwise', () => {
  const OPP = 'o-1'
  const store = openStoreWithCommitted(OPP, 'idea')
  assert.equal(savedCaseFor(canvasOf(store), OPP), null, 'no draft yet reads null')

  const draft: CasePayload = {
    opportunity_id: OPP,
    figures: [{ label: 'rework', value: '~40 h/month', source_ref: 'n-x', kind: 'cost' }],
    assumptions: [],
  }
  store.getState().dispatch(buildCaseDraftedCandidate(SESSION_ID, draft))
  assert.deepEqual(savedCaseFor(canvasOf(store), OPP), draft, 'the saved draft is found by id')
  assert.equal(savedCaseFor(canvasOf(store), 'o-other'), null, 'another id has no draft')
})

// --- assembleCanvasData: the source_ref-tagged context the agent drafts from ---

test('assembleCanvasData lists frame figures, steps, friction, and audit tags tagged with their ids', () => {
  const store = openStore()
  assert.equal(
    assembleCanvasData(canvasOf(store)),
    '(the canvas has little data yet)',
    'an empty canvas reads the fallback line',
  )

  store.getState().dispatch(
    buildFrameSetCandidate(SESSION_ID, {
      north_star: 'cut invoice cycle time',
      volume: '1200/month',
      touch_time: '15 min',
    }),
  )
  store.getState().dispatch(
    buildNodeCreatedCandidate(SESSION_ID, {
      id: 'n1',
      type: 'Step',
      lane: 'ap',
      label: 'Match',
      zone: 2,
      metadata: { action: 'Match invoice to PO' },
    }),
  )
  store.getState().dispatch(
    buildNodeCreatedCandidate(SESSION_ID, {
      id: 'n2',
      type: 'Step',
      lane: 'ap',
      label: 'Approve',
      zone: 2,
    }),
  )
  store.getState().dispatch(
    buildFrictionPinnedCandidate(SESSION_ID, {
      id: 'fr1',
      waste: 'Waiting',
      node_id: 'n1',
      note: 'queues overnight',
    }),
  )
  store.getState().dispatch(
    buildAuditTagSetCandidate(SESSION_ID, {
      id: 'at1',
      node_id: 'n1',
      data: 'structured',
      rules: 'explicit',
      exceptions: 'rare',
    }),
  )

  assert.deepEqual(
    assembleCanvasData(canvasOf(store)).split('\n'),
    [
      'north-star: cut invoice cycle time',
      'volume: 1200/month',
      'touch time: 15 min',
      '[n1] step "Match invoice to PO"',
      '[n2] step "Approve"',
      '[fr1] friction on n1: Waiting (queues overnight)',
      '[at1] data/rules for n1: structured, explicit, rare',
    ],
    'every element line carries the id the model must cite as source_ref',
  )
  assert.equal(getError(store.getState()), null, 'every dispatch left lastError null')
})

// --- Draft validity: traceability makes source_ref part of "addable" ----------

test('a figure draft is valid only with label, value, AND a cited source_ref; an assumption needs statement + source', () => {
  assert.equal(isFigureDraftValid(emptyFigure()), false, 'a blank figure draft is not addable')
  const full: Figure = { label: 'rework', value: '~40 h', source_ref: 'n1', kind: 'cost' }
  assert.equal(isFigureDraftValid(full), true, 'label + value + source is addable')
  assert.equal(isFigureDraftValid({ ...full, label: '   ' }), false, 'whitespace label fails')
  assert.equal(isFigureDraftValid({ ...full, value: '' }), false, 'empty value fails')
  assert.equal(
    isFigureDraftValid({ ...full, source_ref: '' }),
    false,
    'no source_ref fails - traceability is part of validity',
  )

  assert.equal(isAssumptionDraftValid(emptyAssumption()), false, 'a blank assumption fails')
  const asm: Assumption = { statement: '30% mismatch', source: 'Zone 4', confidence: 'med' }
  assert.equal(isAssumptionDraftValid(asm), true, 'statement + source is addable')
  assert.equal(isAssumptionDraftValid({ ...asm, statement: ' ' }), false, 'no statement fails')
  assert.equal(isAssumptionDraftValid({ ...asm, source: '' }), false, 'no source fails')
})

// --- finalizeFigure: the v0.3 A1 normalization ---------------------------------

test('finalizeFigure trims, keeps the benefit class, and carries a redeployment owner only for a named capacity-release owner', () => {
  const cost = finalizeFigure({
    label: ' build ',
    value: ' 10k ',
    source_ref: 'n1',
    kind: 'cost',
    benefit_class: 'hard-savings',
    redeployment_owner: 'someone',
  })
  assert.deepEqual(
    cost,
    { label: 'build', value: '10k', source_ref: 'n1', kind: 'cost' },
    'a cost figure drops classification and owner entirely',
  )

  const hard = finalizeFigure({
    label: 'license',
    value: '-5k',
    source_ref: 'n1',
    kind: 'benefit',
    benefit_class: 'hard-savings',
    redeployment_owner: 'someone',
  })
  assert.deepEqual(
    hard,
    {
      label: 'license',
      value: '-5k',
      source_ref: 'n1',
      kind: 'benefit',
      benefit_class: 'hard-savings',
    },
    'a non-capacity-release benefit never carries an owner',
  )

  const capNoOwner = finalizeFigure({
    label: 'hours',
    value: '30h',
    source_ref: 'n1',
    kind: 'benefit',
    benefit_class: 'capacity-release',
    redeployment_owner: '   ',
  })
  assert.deepEqual(
    capNoOwner,
    {
      label: 'hours',
      value: '30h',
      source_ref: 'n1',
      kind: 'benefit',
      benefit_class: 'capacity-release',
    },
    'a whitespace owner is no owner - the flag stays visible downstream',
  )

  const capOwner = finalizeFigure({
    label: 'hours',
    value: '30h',
    source_ref: 'n1',
    kind: 'benefit',
    benefit_class: 'capacity-release',
    redeployment_owner: ' AP team lead ',
  })
  assert.equal(capOwner.redeployment_owner, 'AP team lead', 'a named owner is kept, trimmed')

  // Defaults mirror the form: an unset kind is a benefit, an unset class hard-savings.
  const defaulted = finalizeFigure({ label: 'x', value: '1', source_ref: 'n1' })
  assert.equal(defaulted.kind, 'benefit', 'kind defaults to benefit')
  assert.equal(defaulted.benefit_class, 'hard-savings', 'class defaults to hard-savings')
})

// --- finalizeAssumption: trimmed, verify_by only when named --------------------

test('finalizeAssumption trims and includes verify_by only when non-empty', () => {
  const bare = finalizeAssumption({
    statement: ' 30% mismatch ',
    source: ' Zone 4 ',
    confidence: 'low',
    verify_by: '   ',
  })
  assert.deepEqual(
    bare,
    { statement: '30% mismatch', source: 'Zone 4', confidence: 'low' },
    'a whitespace verify_by is dropped (exactOptionalPropertyTypes: never undefined)',
  )
  const verified = finalizeAssumption({
    statement: 's',
    source: 'src',
    confidence: 'high',
    verify_by: ' pull the report ',
  })
  assert.equal(verified.verify_by, 'pull the report', 'a named verify_by is kept, trimmed')
})

// --- splitFigures + isCaseDirty: the two columns and the Save affordance -------

test('splitFigures separates the two case sides and isCaseDirty compares the draft to the saved case', () => {
  const cost: Figure = { label: 'build', value: '10k', source_ref: 'n1', kind: 'cost' }
  const benefit: Figure = {
    label: 'license',
    value: '-5k',
    source_ref: 'n1',
    kind: 'benefit',
    benefit_class: 'hard-savings',
  }
  assert.deepEqual(
    splitFigures([cost, benefit, cost]),
    { costs: [cost, cost], benefits: [benefit] },
    'figures split by kind, order preserved',
  )

  // A fresh builder over no saved case is not dirty - nothing to save yet.
  assert.equal(isCaseDirty([], [], null), false, 'empty draft over no saved case is clean')
  assert.equal(isCaseDirty([cost], [], null), true, 'a first figure makes the draft dirty')

  const asm: Assumption = { statement: 's', source: 'src', confidence: 'med' }
  const saved: CasePayload = { opportunity_id: 'o-1', figures: [cost, benefit], assumptions: [asm] }
  assert.equal(isCaseDirty([cost, benefit], [asm], saved), false, 'a matching draft is clean')
  assert.equal(isCaseDirty([benefit, cost], [asm], saved), true, 'reordering figures is a change')
  assert.equal(isCaseDirty([cost, benefit], [], saved), true, 'dropping an assumption is a change')
})

// --- 2026-07-24b: the ledger joins the draft context; the fingerprint drives auto-redraft ---

test('assembleCanvasData lists id-carrying ledger assumptions (citable) and skips id-less ones', () => {
  const store = openStore()
  store.getState().dispatch(
    buildAssumptionAddedCandidate(SESSION_ID, {
      id: 'as-1',
      statement: '60% sit under the threshold',
      source: 'Zone 4',
      confidence: 'low',
      verify_by: 'pull two weeks of holds',
    }),
  )
  store.getState().dispatch(
    buildAssumptionAddedCandidate(SESSION_ID, {
      statement: 'legacy entry with no id',
      source: 'desk',
      confidence: 'med',
    }),
  )
  const data = assembleCanvasData(canvasOf(store))
  assert.match(
    data,
    /\[as-1\] assumption \(low confidence, verify: pull two weeks of holds\): 60% sit under the threshold \(source: Zone 4\)/,
    'an id-carrying assumption is listed, tagged with its citable id',
  )
  assert.doesNotMatch(
    data,
    /legacy entry with no id/,
    'an id-less entry cannot be cited, so it is not offered',
  )
})

test('draftInputsFingerprint moves with the inputs the draft reads and ignores the cases it writes', () => {
  const store = openStoreWithCommitted('o-1', 'Auto-match invoices')
  const opp = () =>
    committedOpportunities(canvasOf(store))[0] as NonNullable<
      ReturnType<typeof committedOpportunities>[0]
    >
  const fp0 = draftInputsFingerprint(canvasOf(store), opp())

  // An input change (a revised ledger assumption) moves the fingerprint -> redraft fires.
  store.getState().dispatch(
    buildAssumptionAddedCandidate(SESSION_ID, {
      id: 'as-1',
      statement: 'most holds clear unchanged',
      source: 'collections desk',
      confidence: 'low',
    }),
  )
  const fp1 = draftInputsFingerprint(canvasOf(store), opp())
  assert.notEqual(fp1, fp0, 'a ledger change moves the fingerprint')

  // The draft WRITING a case must not move it - that would be an infinite loop.
  store.getState().dispatch(
    buildCaseDraftedCandidate(SESSION_ID, {
      opportunity_id: 'o-1',
      figures: [],
      assumptions: [],
    }),
  )
  assert.equal(
    draftInputsFingerprint(canvasOf(store), opp()),
    fp1,
    'a case.drafted dispatch leaves the fingerprint untouched (loop-safe)',
  )
})

test('clearedChecks counts the risk-gate progress the provisional watermark reports', () => {
  const store = openStoreWithCommitted('o-1', 'Auto-match invoices')
  assert.equal(clearedChecks(canvasOf(store), 'o-1'), 0, 'no checks recorded yet')
  const first = GATE_CHECKS[0] as (typeof GATE_CHECKS)[number]
  store
    .getState()
    .dispatch(buildGateCheckedCandidate(SESSION_ID, 'o-1', first, 'cleared', 'reviewed'))
  assert.equal(clearedChecks(canvasOf(store), 'o-1'), 1, 'one cleared check counts')
  assert.equal(
    isCaseEligible(canvasOf(store), 'o-1'),
    false,
    'partial progress is still not eligible',
  )
})
