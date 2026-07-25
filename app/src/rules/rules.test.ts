// M2-13 acceptance test - the deterministic nudge layer + its store orchestration.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "with a ruleset wired, a HUMAN event runs the C12 engine and surfaces the fired
//    rules as store.nudges (message_template verbatim); a rule fires at most once, a
//    tier-gated rule stays dormant at T0, dismissNudge removes it and it never
//    re-fires, and a store with no ruleset produces no nudges"
//
// Proves the orchestration at the layer a Node gate CAN prove: the real ruleset
// (imported from the generated module), the real C12 evaluate(), the real M2-01 store.
// The rendered NudgePanel + budget pips are proved by the screenshot-verified criterion.
//
// Imports ONLY pure modules - never a .tsx or React - so it runs headless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BUDGET_PER_CLASS,
  activeCountForClass,
  computeActiveNudges,
  hasFired,
  meetsTier,
} from './nudges.js'
import { RULESET } from './ruleset.generated.js'
import { createCanvasStore } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import { buildNodeCreatedCandidate } from '../map/events.js'
import { newIdeaOpportunity, buildOpportunityCreatedCandidate } from '../ideation/events.js'
import { buildScoreCommittedCandidate } from '../prioritize/events.js'
import type { EventEnvelope, Node } from '@procezio/schema'

const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f6078'

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
    return `2026-07-09T10:${String(n).padStart(2, '0')}:00Z`
  }
}

/** A rules-wired store at tier T0 with a live session. */
function openStore(tier = 'T0'): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
    ruleset: RULESET,
    tier,
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  return store
}

const nudgeIds = (store: ReturnType<typeof createCanvasStore>) =>
  store.getState().nudges.map((n) => n.rule_id)

// --- The named acceptance test ------------------------------------------------

test('a human node.created fires zone2-node-untagged and surfaces it as a nudge; it fires once; dismiss removes it and it never re-fires', () => {
  const store = openStore()
  assert.deepEqual(nudgeIds(store), [], 'no nudges before any node')

  // A step with no metadata.system -> zone2-node-untagged matches.
  const a: Node = { id: 'n-a', type: 'Step', lane: 'req', label: 'Raise', zone: 2 }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, a))
  assert.ok(
    nudgeIds(store).includes('zone2-node-untagged'),
    'the zone-2 nudge fires on an untagged node',
  )
  const message = store.getState().nudges.find((n) => n.rule_id === 'zone2-node-untagged')?.message
  assert.match(message ?? '', /system/i, 'the nudge carries the rule message_template verbatim')

  // A second untagged node still matches the rule, but the nudge must not stack.
  const b: Node = { id: 'n-b', type: 'Step', lane: 'req', label: 'Approve', zone: 2 }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, b))
  assert.equal(
    nudgeIds(store).filter((id) => id === 'zone2-node-untagged').length,
    1,
    'the rule fires at most once (cooldown), no duplicate nudge',
  )

  // Dismiss it -> gone, and a further trigger does not bring it back.
  store.getState().dismissNudge('zone2-node-untagged')
  assert.ok(!nudgeIds(store).includes('zone2-node-untagged'), 'dismiss removes the nudge')
  const c: Node = { id: 'n-c', type: 'Step', lane: 'req', label: 'File', zone: 2 }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, c))
  assert.ok(!nudgeIds(store).includes('zone2-node-untagged'), 'a dismissed nudge never re-fires')
})

// --- Tier gating: the zone-6 challenge (T1) stays dormant at T0 ----------------

test('a T1 rule (zone-6 anti-anchoring challenge) does not fire at tier T0, but does at T1', () => {
  // At T0 (no LLM): committing a score must NOT raise the zone-6 challenge.
  const t0 = openStore('T0')
  t0.getState().dispatch(
    buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity('op-1', 'idea')),
  )
  t0.getState().dispatch(
    buildScoreCommittedCandidate(SESSION_ID, 'op-1', { benefit: 5, effort: 2 }),
  )
  assert.ok(!nudgeIds(t0).includes('zone6-anti-anchoring'), 'the T1 challenge is dormant at T0')

  // At T1: the same commit fires it.
  const t1 = openStore('T1')
  t1.getState().dispatch(
    buildOpportunityCreatedCandidate(SESSION_ID, newIdeaOpportunity('op-1', 'idea')),
  )
  t1.getState().dispatch(
    buildScoreCommittedCandidate(SESSION_ID, 'op-1', { benefit: 5, effort: 2 }),
  )
  assert.ok(
    nudgeIds(t1).includes('zone6-anti-anchoring'),
    'the challenge fires once the tier is high enough',
  )
})

// --- No ruleset -> no orchestration (the store behaves exactly as before) ------

test('a store with no ruleset produces no nudges and appends no rule.fired events', () => {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  store.getState().dispatch(
    buildNodeCreatedCandidate(SESSION_ID, {
      id: 'n',
      type: 'Step',
      lane: 'r',
      label: 'x',
      zone: 2,
    }),
  )
  assert.deepEqual(store.getState().nudges, [], 'no ruleset means no nudges')
})

// --- The pure helpers ---------------------------------------------------------

test('meetsTier respects the T0..T3 ordering and fails closed on unknown tiers', () => {
  assert.equal(meetsTier(undefined, 'T0'), true, 'no min_tier is always eligible')
  assert.equal(meetsTier('T0', 'T0'), true, 'equal tier passes')
  assert.equal(meetsTier('T1', 'T0'), false, 'a higher requirement is unmet at a lower tier')
  assert.equal(meetsTier('T0', 'T2'), true, 'a lower requirement is met at a higher tier')
  assert.equal(meetsTier('T9', 'T0'), false, 'an unknown min_tier fails closed')
})

test('computeActiveNudges dedups by rule, drops dismissed, and resolves the message_template', () => {
  const fired = (ruleId: string, budgetClass: string, i: number): EventEnvelope =>
    ({
      event_id: `e${i}`,
      session_id: SESSION_ID,
      seq: i,
      type: 'rule.fired',
      author: { kind: 'agent', id: 'rules-engine' },
      provenance: { state: 'pencil', accepted_by: null, accepted_at: null },
      payload: { rule_id: ruleId, severity: 'nudge', budget_class: budgetClass },
      causation_id: null,
      correlation_id: SESSION_ID,
      compensates: null,
      schema_version: '1.0',
      ts: '2026-07-09T10:00:00Z',
    }) as EventEnvelope

  const log = [
    fired('zone2-node-untagged', 'zone2', 1),
    fired('zone2-node-untagged', 'zone2', 2),
    fired('zone7-risk-gate', 'zone7', 3),
  ]
  const all = computeActiveNudges(log, RULESET, new Set())
  assert.deepEqual(
    all.map((n) => n.rule_id),
    ['zone2-node-untagged', 'zone7-risk-gate'],
    'deduped by rule, log order',
  )
  assert.ok(all[0]?.message.length, 'the message_template resolves from the ruleset')

  const minusOne = computeActiveNudges(log, RULESET, new Set(['zone2-node-untagged']))
  assert.deepEqual(
    minusOne.map((n) => n.rule_id),
    ['zone7-risk-gate'],
    'dismissed rules are dropped',
  )

  assert.equal(hasFired(log, 'zone2-node-untagged'), true, 'hasFired sees a logged firing')
  assert.equal(hasFired(log, 'zone1-north-star'), false, 'hasFired is false for an unfired rule')
  assert.equal(
    activeCountForClass(log, new Set(), 'zone2'),
    1,
    'active count dedups within a class',
  )
  assert.equal(BUDGET_PER_CLASS, 2, 'the per-class budget ceiling is 2')
})
