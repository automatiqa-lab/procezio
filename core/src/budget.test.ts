// C14 acceptance + conformance suite for the interjection budget ledger and the
// per-commit cooldown gate.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "3rd would-be firing in a zone's 10-minute rolling window is suppressed - no
//    rule.fired candidate is returned by enforce(), and it never reaches the
//    orchestration-facing output"
//
// The budget ledger is the second half of the deterministic control plane: rules
// (C12) decide WHICH rules fired, budget + cooldown (C14) decide WHICH firings are
// allowed. This suite proves rolling-window arithmetic, multi-zone isolation,
// suppression of the over-budget firing (within a batch and across the log),
// per-commit cooldown, determinism (same log = same output), and - by static
// source scan - the absence of eval/Function/network/clock-RNG/node:* in the module.
//
// node --test runs from the repo root. The MODULE (budget.ts) may not touch node:*;
// THIS test file may, and uses node:fs only to statically scan the module source.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { budgetSpent, cooldownBlocked, enforce, DEFAULT_BUDGET_CONFIG } from './budget.js'
import type { BudgetConfig, EnforcementContext } from './budget.js'
import type { Rule, RuleFiredEventCandidate } from './rule-engine.js'
import type { BudgetPayload, EventEnvelope } from '@procezio/schema'

// --- fixtures -----------------------------------------------------------------

const root = process.cwd()
const clone = <T>(o: T): T => structuredClone(o)

const SESSION = 'aaaaaaaa-0000-4000-8000-00000000000a'

// A fired-rule candidate as C12's evaluate() would emit it. Only the fields the
// ledger reads (rule_id, ts, correlation_id, event_id, session_id) vary per test.
const makeFiring = (
  ruleId: string,
  ts: string,
  opts: { correlationId?: string; eventId?: string } = {},
): RuleFiredEventCandidate => ({
  event_id: opts.eventId ?? `f0000000-0000-4000-8000-00000000000${ruleId.slice(-1)}`,
  session_id: SESSION,
  type: 'rule.fired',
  author: { kind: 'agent', id: 'agent-1' },
  provenance: { state: 'pencil', accepted_by: null, accepted_at: null },
  payload: { rule_id: ruleId, severity: 'nudge', matched_on: 'score.committed' },
  causation_id: '11111111-0000-4000-8000-000000000011',
  correlation_id: opts.correlationId ?? 'cccccccc-0000-4000-8000-00000000000c',
  compensates: null,
  schema_version: '1.0',
  ts,
})

// A stored budget.spent envelope (has seq), for seeding priorEvents.
const makeBudgetEvent = (zoneId: number, ts: string, spent = 1): EventEnvelope => ({
  event_id: `b0000000-0000-4000-8000-00000000000${zoneId}`,
  session_id: SESSION,
  seq: 1,
  type: 'budget.spent',
  author: { kind: 'agent', id: 'agent-1' },
  provenance: { state: 'pencil', accepted_by: null, accepted_at: null },
  payload: { zone_id: zoneId, spent, window: 'PT10M' } satisfies BudgetPayload,
  causation_id: null,
  correlation_id: 'cccccccc-0000-4000-8000-00000000000c',
  compensates: null,
  schema_version: '1.0',
  ts,
})

// A stored rule.fired envelope (has seq), for seeding priorEvents in cooldown tests.
const makeFiredEvent = (ruleId: string, ts: string, correlationId: string): EventEnvelope => ({
  event_id: `e0000000-0000-4000-8000-00000000000${ruleId.slice(-1)}`,
  session_id: SESSION,
  seq: 1,
  type: 'rule.fired',
  author: { kind: 'agent', id: 'agent-1' },
  provenance: { state: 'pencil', accepted_by: null, accepted_at: null },
  payload: { rule_id: ruleId, severity: 'challenge' },
  causation_id: null,
  correlation_id: correlationId,
  compensates: null,
  schema_version: '1.0',
  ts,
})

const makeContext = (): EnforcementContext => ({
  agentId: 'agent-1',
  budgetEventId: (_firing, i) => `dddddddd-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
})

// Default policy: 2 firings per zone per 10-minute window.
const CONFIG: BudgetConfig = DEFAULT_BUDGET_CONFIG
// Every firing in these tests is zone 1 unless a map says otherwise.
const zoneOne = () => 1
const noRules: ReadonlyMap<string, Rule> = new Map()

// --- The named acceptance test ------------------------------------------------

test("3rd would-be firing in a zone's 10-minute rolling window is suppressed - no rule.fired candidate is returned by enforce(), and it never reaches the orchestration-facing output", () => {
  // Three firings for the SAME zone inside one 10-minute window (10:00, 10:03,
  // 10:06 - all within 10 min of the last). Distinct correlations so cooldown is
  // not the cause; the budget alone must stop the third.
  const candidates = [
    makeFiring('r1', '2026-07-06T10:00:00Z', {
      correlationId: 'c1',
      eventId: 'f0000000-0000-4000-8000-000000000001',
    }),
    makeFiring('r2', '2026-07-06T10:03:00Z', {
      correlationId: 'c2',
      eventId: 'f0000000-0000-4000-8000-000000000002',
    }),
    makeFiring('r3', '2026-07-06T10:06:00Z', {
      correlationId: 'c3',
      eventId: 'f0000000-0000-4000-8000-000000000003',
    }),
  ]

  const result = enforce(candidates, noRules, zoneOne, [], CONFIG, makeContext())

  // Exactly the first two firings are allowed; the third is suppressed.
  assert.equal(result.allowed.length, 2, 'first two firings allowed')
  assert.deepEqual(
    result.allowed.map((c) => c.payload.rule_id),
    ['r1', 'r2'],
  )

  // The 3rd firing is NOT in the orchestration-facing output (allowed) at all.
  assert.ok(
    !result.allowed.some((c) => c.payload.rule_id === 'r3'),
    'the over-budget firing never reaches allowed (blocked from orchestration structurally)',
  )
  assert.equal(result.suppressed.length, 1, 'exactly one firing suppressed')
  assert.equal(result.suppressed[0]?.payload.rule_id, 'r3', 'the 3rd firing is the suppressed one')

  // One budget.spent audit event per allowed firing, created AFTER (caused by)
  // its rule.fired, and none minted for the suppressed firing.
  assert.equal(
    result.budgetEvents.length,
    2,
    'one budget.spent per allowed firing, none for suppressed',
  )
  assert.equal(result.budgetEvents[0]?.type, 'budget.spent')
  assert.equal(result.budgetEvents[0]?.payload.zone_id, 1)
  assert.equal(result.budgetEvents[0]?.payload.spent, 1)
  assert.equal(
    result.budgetEvents[0]?.causation_id,
    'f0000000-0000-4000-8000-000000000001',
    'budget.spent is caused by (created after) the rule.fired it records',
  )
  assert.ok(
    !result.budgetEvents.some((b) => b.causation_id === 'f0000000-0000-4000-8000-000000000003'),
    'no budget.spent minted for the suppressed 3rd firing',
  )
})

// --- budgetSpent: rolling-window arithmetic -----------------------------------

test('budgetSpent: half-open window (lower exclusive, upper inclusive), multi-zone isolation, zero prior', () => {
  // No prior events -> zero spend.
  assert.equal(budgetSpent([], 1, '2026-07-06T10:00:00Z', 600_000), 0)

  const events = [
    makeBudgetEvent(1, '2026-07-06T09:56:00Z'), // exactly 10 min before 10:06 -> OUT (lower exclusive)
    makeBudgetEvent(1, '2026-07-06T09:57:00Z'), // inside window -> counted
    makeBudgetEvent(1, '2026-07-06T10:06:00Z'), // exactly at asOf -> counted (upper inclusive)
    makeBudgetEvent(2, '2026-07-06T10:00:00Z'), // different zone -> not counted for zone 1
  ]
  // Zone 1, asOf 10:06, window 10 min: 09:56 aged out, 09:57 + 10:06 counted = 2.
  assert.equal(
    budgetSpent(events, 1, '2026-07-06T10:06:00Z', 600_000),
    2,
    'lower bound exclusive, upper inclusive',
  )
  // Zone 2 is isolated: only its own spend counts.
  assert.equal(budgetSpent(events, 2, '2026-07-06T10:06:00Z', 600_000), 1, 'zones are isolated')
  // A malformed ts contributes nothing and does not throw.
  assert.equal(
    budgetSpent([makeBudgetEvent(1, 'not-a-date')], 1, '2026-07-06T10:06:00Z', 600_000),
    0,
  )
})

// --- enforce: allow / suppress across batches ---------------------------------

test('enforce: 1st and 2nd firing allowed, each with a budget.spent; 3rd suppressed across the prior log too', () => {
  // Two spends already in the prior log inside the window -> the very first
  // candidate of this batch is the 3rd in the window and is suppressed.
  const prior = [
    makeBudgetEvent(1, '2026-07-06T10:00:00Z'),
    makeBudgetEvent(1, '2026-07-06T10:03:00Z'),
  ]
  const cand = [makeFiring('r3', '2026-07-06T10:06:00Z', { correlationId: 'c9' })]
  const result = enforce(cand, noRules, zoneOne, prior, CONFIG, makeContext())
  assert.deepEqual(result.allowed, [], 'over-budget across the prior log: nothing allowed')
  assert.equal(result.suppressed.length, 1)
  assert.equal(result.budgetEvents.length, 0, 'no spend recorded for a suppressed firing')
})

test('enforce: a firing in a DIFFERENT zone has its own budget (multi-zone isolation)', () => {
  const prior = [
    makeBudgetEvent(1, '2026-07-06T10:00:00Z'),
    makeBudgetEvent(1, '2026-07-06T10:03:00Z'),
  ]
  // Zone 1 is exhausted, but this firing resolves to zone 2 -> allowed.
  const cand = [makeFiring('r', '2026-07-06T10:06:00Z', { correlationId: 'c8' })]
  const result = enforce(cand, noRules, () => 2, prior, CONFIG, makeContext())
  assert.equal(result.allowed.length, 1, 'zone-2 firing unaffected by zone-1 budget')
  assert.equal(result.budgetEvents[0]?.payload.zone_id, 2)
})

test('enforce: window rolls forward - an old spend ages out and frees budget', () => {
  // Two spends far in the past (before 09:50) are outside the window of an 10:06
  // firing, so it is allowed.
  const prior = [
    makeBudgetEvent(1, '2026-07-06T09:40:00Z'),
    makeBudgetEvent(1, '2026-07-06T09:45:00Z'),
  ]
  const cand = [makeFiring('r', '2026-07-06T10:06:00Z', { correlationId: 'c7' })]
  const result = enforce(cand, noRules, zoneOne, prior, CONFIG, makeContext())
  assert.equal(result.allowed.length, 1, 'aged-out spends do not count against the window')
})

// --- enforce: per-commit cooldown ---------------------------------------------

test('enforce: a per_commit rule fires once per correlation id, and again under a NEW correlation id', () => {
  const rules: ReadonlyMap<string, Rule> = new Map([
    [
      'z6',
      {
        id: 'z6',
        when: { event_type: 'score.committed' },
        severity: 'challenge',
        cooldown: 'per_commit',
      },
    ],
  ])
  // Two firings of the SAME per_commit rule under the SAME correlation (one commit)
  // then a third under a DIFFERENT correlation (a new commit).
  const cand = [
    makeFiring('z6', '2026-07-06T10:00:00Z', {
      correlationId: 'commit-A',
      eventId: 'f0000000-0000-4000-8000-0000000000a1',
    }),
    makeFiring('z6', '2026-07-06T10:00:00Z', {
      correlationId: 'commit-A',
      eventId: 'f0000000-0000-4000-8000-0000000000a2',
    }),
    makeFiring('z6', '2026-07-06T10:00:00Z', {
      correlationId: 'commit-B',
      eventId: 'f0000000-0000-4000-8000-0000000000b1',
    }),
  ]
  const result = enforce(cand, rules, zoneOne, [], CONFIG, makeContext())
  assert.equal(result.allowed.length, 2, 'once per commit-A, once per commit-B')
  assert.deepEqual(
    result.allowed.map((c) => c.correlation_id),
    ['commit-A', 'commit-B'],
    'the duplicate within commit-A is the one dropped',
  )
  assert.equal(result.suppressed.length, 1)
  assert.equal(result.suppressed[0]?.correlation_id, 'commit-A')
})

test('enforce: cooldown reads the prior event log - a rule already fired for this commit is blocked', () => {
  const rules: ReadonlyMap<string, Rule> = new Map([
    [
      'z6',
      {
        id: 'z6',
        when: { event_type: 'score.committed' },
        severity: 'challenge',
        cooldown: 'per_commit',
      },
    ],
  ])
  // The commit already has a z6 firing in the log; a new candidate for the same
  // commit is suppressed by the fold over prior rule.fired events.
  const prior = [makeFiredEvent('z6', '2026-07-06T09:59:00Z', 'commit-A')]
  const cand = [makeFiring('z6', '2026-07-06T10:00:00Z', { correlationId: 'commit-A' })]
  const result = enforce(cand, rules, zoneOne, prior, CONFIG, makeContext())
  assert.equal(result.allowed.length, 0, 'per_commit cooldown sourced from the event-log fold')
  assert.equal(result.suppressed.length, 1)
})

test('cooldownBlocked: true only for the same rule_id AND correlation on a rule.fired event', () => {
  const fired = [makeFiredEvent('z6', '2026-07-06T10:00:00Z', 'commit-A')]
  assert.equal(cooldownBlocked(fired, 'z6', 'commit-A'), true)
  assert.equal(cooldownBlocked(fired, 'z6', 'commit-B'), false, 'different commit is not blocked')
  assert.equal(cooldownBlocked(fired, 'other', 'commit-A'), false, 'different rule is not blocked')
  // A budget.spent event with the same correlation must not count as a firing.
  assert.equal(
    cooldownBlocked(
      [makeBudgetEvent(1, '2026-07-06T10:00:00Z')],
      'z6',
      'cccccccc-0000-4000-8000-00000000000c',
    ),
    false,
  )
})

// --- Determinism --------------------------------------------------------------

test('enforce is deterministic: identical inputs (fresh clones) yield deep-equal output', () => {
  // A synthetic batch exercising allow, budget-suppress, and cooldown-suppress at
  // once, replayed twice through deep-cloned inputs - the determinism invariant.
  const rules: ReadonlyMap<string, Rule> = new Map([
    [
      'z6',
      {
        id: 'z6',
        when: { event_type: 'score.committed' },
        severity: 'challenge',
        cooldown: 'per_commit',
      },
    ],
  ])
  const candidates = [
    makeFiring('r1', '2026-07-06T10:00:00Z', {
      correlationId: 'c1',
      eventId: 'f0000000-0000-4000-8000-000000000011',
    }),
    makeFiring('r1', '2026-07-06T10:03:00Z', {
      correlationId: 'c2',
      eventId: 'f0000000-0000-4000-8000-000000000012',
    }),
    makeFiring('r1', '2026-07-06T10:06:00Z', {
      correlationId: 'c3',
      eventId: 'f0000000-0000-4000-8000-000000000013',
    }), // budget-suppressed
    makeFiring('z6', '2026-07-06T10:07:00Z', {
      correlationId: 'commit-A',
      eventId: 'f0000000-0000-4000-8000-000000000014',
    }),
    makeFiring('z6', '2026-07-06T10:08:00Z', {
      correlationId: 'commit-A',
      eventId: 'f0000000-0000-4000-8000-000000000015',
    }), // cooldown-suppressed
  ]
  const prior: EventEnvelope[] = []
  // r1 firings live in zone 1, z6 firings in zone 2, so the r1 budget and the z6
  // cooldown are exercised independently in one batch.
  const zoneByRule = (c: RuleFiredEventCandidate): number => (c.payload.rule_id === 'z6' ? 2 : 1)

  const first = enforce(
    clone(candidates),
    rules,
    zoneByRule,
    clone(prior),
    clone(CONFIG),
    makeContext(),
  )
  const second = enforce(
    clone(candidates),
    rules,
    zoneByRule,
    clone(prior),
    clone(CONFIG),
    makeContext(),
  )

  assert.deepEqual(first, second, 'same log = same budget.* events and firing decisions')
  // Sanity on the shape the determinism guarantee covers: r1@10:00 + r1@10:03
  // allowed (zone 1), r1@10:06 budget-suppressed, z6@10:07 allowed (zone 2, fresh
  // budget), z6@10:08 cooldown-suppressed (same commit-A).
  assert.deepEqual(
    first.allowed.map((c) => c.payload.rule_id),
    ['r1', 'r1', 'z6'],
  )
  assert.equal(first.suppressed.length, 2)
  assert.equal(first.budgetEvents.length, 3)
})

// --- Static source conformance (layering guarantees) --------------------------

test('budget.ts contains no eval/Function, no network, no clock/RNG, no node:* import', () => {
  const src = readFileSync(join(root, 'core', 'src', 'budget.ts'), 'utf8')
  assert.doesNotMatch(src, /eval\(|Function\(|new\s+Function/, 'no eval/Function anywhere')
  assert.doesNotMatch(
    src,
    /\bfetch\s*\(|\baxios\b|XMLHttpRequest|\bWebSocket\b/,
    'no network client calls',
  )
  assert.doesNotMatch(src, /from\s+['"](?:node:)?https?['"]/, 'no http(s) transport import')
  assert.doesNotMatch(
    src,
    /from\s+['"][^'"]*(?:openai|anthropic|\bllm)[^'"]*['"]/i,
    'no LLM/provider module import',
  )
  // Deterministic: no clock, no RNG. Date.parse (a pure parser) is allowed; the
  // non-deterministic Date.now / Math.random call sites are what must be absent.
  assert.doesNotMatch(src, /Date\.now\s*\(|Math\.random\s*\(/, 'no clock or RNG call')
  assert.doesNotMatch(src, /from\s+['"]node:/, 'the ledger must not import from node:*')
})
