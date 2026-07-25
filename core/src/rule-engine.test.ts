// C12 acceptance + conformance test suite.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "rule-engine: anti-anchoring - a rule with when:{event_type:'score.committed'}
//    fires only on a score.committed triggeringEvent and stays silent (returns [])
//    for every other EventType in the fixture set"
//
// The rule engine is the deterministic control plane: rules decide WHETHER, never
// the model. This suite proves matching, ordering, candidate shape, ruleset schema
// validation, determinism, prototype-pollution safety, and (by static source scan)
// the absence of eval/Function/network/clock in the module.
//
// Resolution: node --test runs from the repo root, so the schema and the module
// source are read via process.cwd(), independent of where this test compiles to
// (core/dist under the tsc build). The MODULE (rule-engine.ts) may not touch
// node:*; THIS test file may, and uses node:fs to load the schema, node:module to
// require the dev-only YAML parser, and to statically scan the module source.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { evaluate, createRuleValidator, RULESET_JSON_SCHEMA } from './rule-engine.js'
import type { Ruleset, EvaluateContext, RuleFiredEventCandidate } from './rule-engine.js'
import { createEventStore } from './event-store.js'
import type { Canvas, EventEnvelope, EventType } from '@procezio/schema'

// --- fixtures -----------------------------------------------------------------

const root = process.cwd()
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(root, rel), 'utf8'))

// The full schema document, reused to (a) drive the anti-anchoring test across the
// REAL EventType union (not a hardcoded copy, so it can never fall out of sync) and
// (b) feed the event store's ajv validation path for the candidate-shape check.
const schema = readJson('schema/canvas.schema.json') as {
  $id: string
  $defs: { EventType: { enum: EventType[] } }
  [k: string]: unknown
}
const ALL_EVENT_TYPES: readonly EventType[] = schema.$defs.EventType.enum

const SESSION = 'aaaaaaaa-0000-4000-8000-00000000000a'
const CORR = 'bbbbbbbb-0000-4000-8000-00000000000b'

const clone = <T>(o: T): T => structuredClone(o)

// A small, realistic canvas projection to run path predicates against.
const PROJECTION: Canvas = {
  schema_version: '1.0',
  process: {
    name: 'Order to Cash',
    trigger: 'PO received',
    end_state: 'Cash collected',
    owner: 'ops',
    north_star: 'DSO < 30 days',
    volume: '1200',
  },
  lanes: [{ id: 'lane-ops', actor: 'Ops' }],
  nodes: [
    { id: 'n1', type: 'Start', lane: 'lane-ops', label: 'Start' },
    { id: 'n2', type: 'Step', lane: 'lane-ops', label: 'Match invoice' },
  ],
  edges: [{ id: 'e1', from: 'n1', to: 'n2', kind: 'sequence' }],
  zones: [{ id: 1, phase: 'Understand', name: 'Frame' }],
  opportunities: [
    {
      id: 'o1',
      title: 'Auto-match invoice',
      rung: 'Automate',
      committed: true,
      score: { benefit: 5, effort: 2 },
    },
  ],
}

// A triggering event carrying just enough to be a valid EventEnvelope. evaluate()
// only reads .type and .event_id; payload family is irrelevant to matching.
const makeEvent = (
  type: EventType,
  eventId = '11111111-0000-4000-8000-000000000011',
): EventEnvelope => ({
  event_id: eventId,
  session_id: SESSION,
  seq: 1,
  type,
  author: { kind: 'human', id: 'user-1' },
  provenance: { state: 'ink', accepted_by: null, accepted_at: null },
  payload: { text: 'trigger' },
  correlation_id: CORR,
  schema_version: '1.0',
  ts: '2026-07-06T10:00:00Z',
})

// Deterministic context: identity (event_id) and clock (ts) are caller-supplied,
// never invented by the engine, so replay is byte-identical. The eventId factory is
// pure (depends only on the fired-rule index) and emits ajv-valid uuids.
const makeContext = (): EvaluateContext => ({
  sessionId: SESSION,
  correlationId: CORR,
  schemaVersion: '1.0',
  agentId: 'agent-1',
  eventId: (_rule, i) => `abcdef00-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
  ts: '2026-07-06T10:00:00Z',
})

const ruleset = (rules: Ruleset['rules']): Ruleset => ({ version: '1.0', rules })

// --- The named acceptance test: anti-anchoring --------------------------------

test("rule-engine: anti-anchoring - a rule with when:{event_type:'score.committed'} fires only on a score.committed triggeringEvent and stays silent (returns []) for every other EventType in the fixture set", () => {
  const rs = ruleset([
    { id: 'zone6-rescore', when: { event_type: 'score.committed' }, severity: 'challenge' },
  ])

  // The fixture set is the ENTIRE EventType union, read from the ratified schema
  // so silence is proven exhaustively, not for a coincidental subset.
  assert.ok(ALL_EVENT_TYPES.includes('score.committed'), 'fixture set includes the trigger type')

  for (const type of ALL_EVENT_TYPES) {
    const fired = evaluate(rs, PROJECTION, makeEvent(type), makeContext())
    if (type === 'score.committed') {
      assert.equal(fired.length, 1, 'fires exactly once on score.committed')
      assert.equal(fired[0]?.payload.rule_id, 'zone6-rescore')
      assert.equal(fired[0]?.type, 'rule.fired')
    } else {
      assert.deepEqual(fired, [], `stays silent on ${type}`)
    }
  }
})

// --- Every when-condition shape ------------------------------------------------

test('leaf shape: event_type predicate matches the triggering event type', () => {
  const rs = ruleset([{ id: 'r', when: { event_type: 'node.created' }, severity: 'info' }])
  assert.equal(evaluate(rs, PROJECTION, makeEvent('node.created'), makeContext()).length, 1)
  assert.equal(evaluate(rs, PROJECTION, makeEvent('edge.created'), makeContext()).length, 0)
})

test('leaf shape: path equality (eq / neq)', () => {
  const eq = ruleset([
    { id: 'r', when: { path: 'process.name', op: 'eq', value: 'Order to Cash' }, severity: 'info' },
  ])
  assert.equal(evaluate(eq, PROJECTION, makeEvent('agent.message'), makeContext()).length, 1)

  const eqMiss = ruleset([
    { id: 'r', when: { path: 'process.name', op: 'eq', value: 'Nope' }, severity: 'info' },
  ])
  assert.equal(evaluate(eqMiss, PROJECTION, makeEvent('agent.message'), makeContext()).length, 0)

  const neq = ruleset([
    { id: 'r', when: { path: 'process.owner', op: 'neq', value: 'finance' }, severity: 'info' },
  ])
  assert.equal(evaluate(neq, PROJECTION, makeEvent('agent.message'), makeContext()).length, 1)
})

test('leaf shape: path comparison (gt / lt / gte / lte)', () => {
  const cases: Array<['gt' | 'lt' | 'gte' | 'lte', string, number, boolean]> = [
    ['gt', 'opportunities.0.score.benefit', 3, true],
    ['gt', 'opportunities.0.score.benefit', 5, false],
    ['lt', 'opportunities.0.score.effort', 3, true],
    ['gte', 'opportunities.0.score.benefit', 5, true],
    ['lte', 'opportunities.0.score.effort', 2, true],
    ['gt', 'nodes.length', 1, true], // array own 'length' property is reachable
  ]
  for (const [op, path, value, expected] of cases) {
    const rs = ruleset([{ id: 'r', when: { path, op, value }, severity: 'info' }])
    assert.equal(
      evaluate(rs, PROJECTION, makeEvent('agent.message'), makeContext()).length === 1,
      expected,
      `${path} ${op} ${value}`,
    )
  }

  // Incomparable operands (string vs number) never fire, and never throw.
  const bad = ruleset([
    { id: 'r', when: { path: 'process.name', op: 'gt', value: 3 }, severity: 'info' },
  ])
  assert.equal(evaluate(bad, PROJECTION, makeEvent('agent.message'), makeContext()).length, 0)
})

test('leaf shape: path existence (exists)', () => {
  const present = ruleset([
    { id: 'r', when: { path: 'process.north_star', op: 'exists' }, severity: 'info' },
  ])
  assert.equal(evaluate(present, PROJECTION, makeEvent('agent.message'), makeContext()).length, 1)

  const absent = ruleset([
    { id: 'r', when: { path: 'process.made_up_field', op: 'exists' }, severity: 'info' },
  ])
  assert.equal(evaluate(absent, PROJECTION, makeEvent('agent.message'), makeContext()).length, 0)
})

test('leaf shape: membership (in)', () => {
  const rs = ruleset([
    {
      id: 'r',
      when: { path: 'process.name', op: 'in', value: ['A', 'Order to Cash'] },
      severity: 'info',
    },
  ])
  assert.equal(evaluate(rs, PROJECTION, makeEvent('agent.message'), makeContext()).length, 1)

  const miss = ruleset([
    { id: 'r', when: { path: 'process.name', op: 'in', value: ['A', 'B'] }, severity: 'info' },
  ])
  assert.equal(evaluate(miss, PROJECTION, makeEvent('agent.message'), makeContext()).length, 0)
})

test('logical shapes: all / any / not compose recursively', () => {
  const all = ruleset([
    {
      id: 'r',
      when: {
        all: [
          { event_type: 'score.committed' },
          { path: 'opportunities.0.score.benefit', op: 'gte', value: 4 },
        ],
      },
      severity: 'nudge',
    },
  ])
  assert.equal(evaluate(all, PROJECTION, makeEvent('score.committed'), makeContext()).length, 1)
  assert.equal(
    evaluate(all, PROJECTION, makeEvent('node.created'), makeContext()).length,
    0,
    'all short-circuits when one child is false',
  )

  const any = ruleset([
    {
      id: 'r',
      when: {
        any: [{ event_type: 'node.created' }, { path: 'process.owner', op: 'eq', value: 'ops' }],
      },
      severity: 'info',
    },
  ])
  assert.equal(
    evaluate(any, PROJECTION, makeEvent('gate.checked'), makeContext()).length,
    1,
    'any fires when the second child matches',
  )

  const notCond = ruleset([
    {
      id: 'r',
      when: { not: { path: 'process.owner', op: 'eq', value: 'finance' } },
      severity: 'info',
    },
  ])
  assert.equal(
    evaluate(notCond, PROJECTION, makeEvent('agent.message'), makeContext()).length,
    1,
    'not negates its child',
  )
})

// --- Rule ordering -------------------------------------------------------------

test('matched rules are returned in ruleset order', () => {
  const rs = ruleset([
    { id: 'first', when: { path: 'process.owner', op: 'eq', value: 'ops' }, severity: 'info' },
    { id: 'second', when: { event_type: 'score.committed' }, severity: 'nudge' },
    {
      id: 'third',
      when: { path: 'opportunities.0.committed', op: 'eq', value: true },
      severity: 'challenge',
    },
  ])
  const fired = evaluate(rs, PROJECTION, makeEvent('score.committed'), makeContext())
  assert.deepEqual(
    fired.map((f) => f.payload.rule_id),
    ['first', 'second', 'third'],
  )
})

// --- Candidate structure -------------------------------------------------------

test('each fired rule is a valid rule.fired EventCandidate (accepted by the event store)', () => {
  const rs = ruleset([
    {
      id: 'zone6',
      when: { event_type: 'score.committed' },
      severity: 'challenge',
      budget_class: 'zone6',
      message_template: 'Re-examine effort.',
    },
  ])
  const fired = evaluate(rs, PROJECTION, makeEvent('score.committed'), makeContext())
  assert.equal(fired.length, 1)
  const cand = fired[0] as RuleFiredEventCandidate

  // payload is the ratified RuleFiredPayload shape.
  assert.equal(cand.payload.rule_id, 'zone6')
  assert.equal(cand.payload.severity, 'challenge')
  assert.equal(
    cand.payload.budget_class,
    'zone6',
    'budget_class carried through (not enforced here)',
  )
  assert.equal(cand.payload.matched_on, 'score.committed')

  // envelope invariants: agent-authored, born pencil, caused by the trigger.
  assert.equal(cand.type, 'rule.fired')
  assert.equal(cand.author.kind, 'agent')
  assert.equal(cand.provenance.state, 'pencil')
  assert.equal(cand.causation_id, '11111111-0000-4000-8000-000000000011')

  // message_template is NOT rendered - it never appears in the emitted payload.
  assert.equal((cand.payload as unknown as Record<string, unknown>).message_template, undefined)

  // The store validates it against canvas.schema.json's EventEnvelope and accepts
  // it (assigning seq): proof it is a structurally valid candidate, not just typed.
  const store = createEventStore()
  const result = store.append(cand)
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors))
  if (result.ok) {
    assert.equal(result.event.seq, 1)
    assert.equal(result.event.provenance.state, 'pencil', 'store confirms two-ink pencil birth')
  }
})

// --- Ruleset schema validation (YAML) -----------------------------------------

test('createRuleValidator: a valid YAML ruleset parses and validates with zero errors; invalid copies are rejected', () => {
  // Dev-only YAML parse (js-yaml, MIT) via createRequire so the test needs no
  // @types dependency and the isomorphic module needs no YAML runtime at all.
  const require_ = createRequire(import.meta.url)
  const yaml = require_('js-yaml') as { load(input: string): unknown }

  const yamlRuleset = [
    'version: "1.0"',
    'rules:',
    '  - id: anti-anchor-score',
    '    when:',
    '      event_type: score.committed',
    '    severity: challenge',
    '    message_template: "Reconsider your effort score."',
    '  - id: high-benefit-nudge',
    '    when:',
    '      all:',
    '        - path: opportunities.0.score.benefit',
    '          op: gte',
    '          value: 4',
    '        - not:',
    '            path: process.owner',
    '            op: eq',
    '            value: finance',
    '    severity: nudge',
    '    budget_class: zone6',
  ].join('\n')

  const parsed = yaml.load(yamlRuleset)
  const validate = createRuleValidator()

  assert.equal(validate(parsed), true, JSON.stringify(validate.errors))

  // Sanity: the parsed object actually evaluates through the engine. On a
  // score.committed with this projection BOTH rules match (the anti-anchor rule
  // by event type; the nudge because benefit 5 >= 4 and owner is not finance).
  const fired = evaluate(parsed as Ruleset, PROJECTION, makeEvent('score.committed'), makeContext())
  assert.deepEqual(
    fired.map((f) => f.payload.rule_id),
    ['anti-anchor-score', 'high-benefit-nudge'],
  )

  // (a) unknown op is rejected.
  const badOp = clone(parsed) as { rules: Array<{ when: { all?: Array<{ op?: string }> } }> }
  const firstChild = badOp.rules[1]?.when.all?.[0]
  if (firstChild) firstChild.op = 'approximately'
  assert.equal(createRuleValidator()(badOp), false, 'unknown op must fail validation')

  // (b) non-string id is rejected.
  const badId = clone(parsed) as { rules: Array<{ id: unknown }> }
  if (badId.rules[0]) badId.rules[0].id = 42
  assert.equal(createRuleValidator()(badId), false, 'non-string id must fail validation')

  // The schema is a self-contained object (the constant the module exports).
  assert.equal(RULESET_JSON_SCHEMA.title, 'Ruleset')
})

// --- Determinism ---------------------------------------------------------------

test('evaluate is deterministic: identical inputs (fresh clones) yield deep-equal output', () => {
  const rs = ruleset([
    { id: 'a', when: { event_type: 'score.committed' }, severity: 'challenge' },
    {
      id: 'b',
      when: { path: 'opportunities.0.score.benefit', op: 'gt', value: 1 },
      severity: 'nudge',
    },
  ])
  const ev = makeEvent('score.committed')

  const first = evaluate(clone(rs), clone(PROJECTION), clone(ev), makeContext())
  const second = evaluate(clone(rs), clone(PROJECTION), clone(ev), makeContext())
  assert.deepEqual(first, second, 'same inputs must produce byte-identical output')
  assert.equal(first.length, 2)
})

// --- Prototype-pollution safety ------------------------------------------------

test('path lookup refuses prototype-chain segments (no pollution / getter injection)', () => {
  for (const path of ['__proto__.polluted', 'constructor.name', 'process.constructor.prototype']) {
    const rs = ruleset([{ id: 'r', when: { path, op: 'exists' }, severity: 'info' }])
    assert.equal(
      evaluate(rs, PROJECTION, makeEvent('agent.message'), makeContext()).length,
      0,
      `${path} must resolve to nothing`,
    )
  }
})

// --- Collection quantifiers: exists / every -----------------------------------

// Canvas fixtures for the quantifier tests, differing only in their `nodes` (and
// once in `edges`), built off the base PROJECTION so every other collection stays
// valid. `withNodes` re-binds just the nodes array.
const withNodes = (nodes: Canvas['nodes']): Canvas => ({ ...clone(PROJECTION), nodes })

// Every node carries metadata.system.
const ALL_SYSTEM = withNodes([
  { id: 'n1', type: 'Start', lane: 'lane-ops', label: 'Start', metadata: { system: 'SAP' } },
  { id: 'n2', type: 'Step', lane: 'lane-ops', label: 'Match', metadata: { system: 'SAP' } },
])
// One node lacks metadata.system (n2 has metadata but no system; n1 has none at all).
const MIXED_SYSTEM = withNodes([
  { id: 'n1', type: 'Start', lane: 'lane-ops', label: 'Start' },
  { id: 'n2', type: 'Step', lane: 'lane-ops', label: 'Match', metadata: { system: 'SAP' } },
])
// No nodes at all - drives every's vacuous truth and exists's vacuous falsity.
const NO_NODES = withNodes([])

const firedCount = (rs: Ruleset, canvas: Canvas, type: EventType = 'agent.message'): number =>
  evaluate(rs, canvas, makeEvent(type), makeContext()).length

test("rule-engine: exists/every quantifiers - {exists:{in:'nodes',where:{not:{path:'metadata.system',op:'exists'}}}} fires (matches >=1 node lacking metadata.system) and stays silent when every node has it; {every:{in:'nodes',where:{path:'metadata.system',op:'exists'}}} shows the dual behavior (fires only when ALL nodes have it, vacuously true for an empty nodes array)", () => {
  // exists: at least one node WITHOUT metadata.system.
  const existsMissing = ruleset([
    {
      id: 'nodes-missing-system',
      when: { exists: { in: 'nodes', where: { not: { path: 'metadata.system', op: 'exists' } } } },
      severity: 'nudge',
    },
  ])
  assert.equal(firedCount(existsMissing, MIXED_SYSTEM), 1, 'fires: >=1 node lacks metadata.system')
  assert.equal(firedCount(existsMissing, ALL_SYSTEM), 0, 'silent: every node has metadata.system')
  assert.equal(firedCount(existsMissing, NO_NODES), 0, 'exists is vacuously FALSE for empty nodes')

  // every: ALL nodes carry metadata.system.
  const everyHasSystem = ruleset([
    {
      id: 'nodes-all-system',
      when: { every: { in: 'nodes', where: { path: 'metadata.system', op: 'exists' } } },
      severity: 'info',
    },
  ])
  assert.equal(firedCount(everyHasSystem, ALL_SYSTEM), 1, 'fires: all nodes have metadata.system')
  assert.equal(
    firedCount(everyHasSystem, MIXED_SYSTEM),
    0,
    'silent: one node lacks metadata.system',
  )
  assert.equal(firedCount(everyHasSystem, NO_NODES), 1, 'every is vacuously TRUE for empty nodes')
})

test('quantifiers: existing {path,op,value} and logical predicates still work unchanged around them', () => {
  // A quantifier composes through the existing all/any/not branches for free.
  const composed = ruleset([
    {
      id: 'composed',
      when: {
        all: [
          { exists: { in: 'nodes', where: { path: 'type', op: 'eq', value: 'Start' } } },
          { every: { in: 'nodes', where: { path: 'lane', op: 'eq', value: 'lane-ops' } } },
        ],
      },
      severity: 'info',
    },
  ])
  // ALL_SYSTEM: has a Start node AND every node is in lane-ops -> both quantifiers true.
  assert.equal(firedCount(composed, ALL_SYSTEM), 1, 'all[exists, every] composes and fires')

  // Break the `every` half: retag one node's lane so not-all are lane-ops.
  const offLane = withNodes([
    { id: 'n1', type: 'Start', lane: 'lane-ops', label: 'Start' },
    { id: 'n2', type: 'Step', lane: 'lane-other', label: 'Match' },
  ])
  assert.equal(firedCount(composed, offLane), 0, 'all short-circuits when the every child is false')
})

test('inside where: {path:...} reads the CURRENT ELEMENT, not the whole canvas', () => {
  // process.name exists at the CANVAS root but never on a node element. If the
  // where's path resolved against the canvas this would fire; scoped to the element
  // it must not. This is the load-bearing dual-root check.
  const wrongScope = ruleset([
    {
      id: 'r',
      when: { exists: { in: 'nodes', where: { path: 'process.name', op: 'exists' } } },
      severity: 'info',
    },
  ])
  assert.equal(
    firedCount(wrongScope, PROJECTION),
    0,
    'path in where reads the element, so canvas-root process.name is invisible',
  )

  // A path that DOES exist on the element resolves correctly.
  const rightScope = ruleset([
    {
      id: 'r',
      when: { exists: { in: 'nodes', where: { path: 'label', op: 'eq', value: 'Match invoice' } } },
      severity: 'info',
    },
  ])
  assert.equal(firedCount(rightScope, PROJECTION), 1, 'path in where reads the current element')
})

test('inside where: {event_type:...} still refers to the outer triggering event', () => {
  const rs = ruleset([
    {
      id: 'r',
      when: { exists: { in: 'nodes', where: { event_type: 'score.committed' } } },
      severity: 'challenge',
    },
  ])
  // The event identity does not change with scope: the where sees the trigger.
  assert.equal(
    firedCount(rs, PROJECTION, 'score.committed'),
    1,
    'event_type in where matches the outer trigger',
  )
  assert.equal(
    firedCount(rs, PROJECTION, 'node.created'),
    0,
    'event_type in where is silent on a different trigger',
  )
})

test('nested quantifier: an exists inside a where re-roots its own collection lookup to the CANVAS, not the element', () => {
  // The inner {in:'edges'} must read canvas-level edges (PROJECTION has one), NOT a
  // property of the node element (a node has no `edges`). If collection lookups
  // wrongly threaded the element scope, this would never fire.
  const rs = ruleset([
    {
      id: 'r',
      when: {
        exists: {
          in: 'nodes',
          where: { exists: { in: 'edges', where: { path: 'kind', op: 'eq', value: 'sequence' } } },
        },
      },
      severity: 'info',
    },
  ])
  assert.equal(firedCount(rs, PROJECTION), 1, 'inner exists re-roots to canvas-level edges')

  // Absent optional collection defaults to [] -> inner exists vacuously false.
  const noEdges: Canvas = { ...clone(PROJECTION), edges: [] }
  assert.equal(
    firedCount(rs, noEdges),
    0,
    'empty edges collection makes the inner exists vacuously false',
  )
})

test('createRuleValidator: exists/every rulesets validate, and malformed quantifiers are rejected', () => {
  const validate = createRuleValidator()

  const good: Ruleset = ruleset([
    {
      id: 'e1',
      when: { exists: { in: 'nodes', where: { not: { path: 'metadata.system', op: 'exists' } } } },
      severity: 'nudge',
    },
    {
      id: 'e2',
      when: { every: { in: 'opportunities', where: { path: 'committed', op: 'eq', value: true } } },
      severity: 'info',
    },
  ])
  assert.equal(validate(good), true, JSON.stringify(validate.errors))

  // (a) missing `where` is rejected (required: ['in','where']).
  const missingWhere = {
    version: '1.0',
    rules: [{ id: 'r', when: { exists: { in: 'nodes' } }, severity: 'info' }],
  }
  assert.equal(
    createRuleValidator()(missingWhere),
    false,
    'exists without where must fail validation',
  )

  // (b) unknown collection name is rejected (CollectionName enum).
  const badCollection = {
    version: '1.0',
    rules: [
      {
        id: 'r',
        when: { every: { in: 'not_a_real_collection', where: { path: 'x', op: 'exists' } } },
        severity: 'info',
      },
    ],
  }
  assert.equal(
    createRuleValidator()(badCollection),
    false,
    'unknown collection must fail validation',
  )

  // (c) an extra unexpected key inside the quantifier body is rejected (additionalProperties:false).
  const extraKey = {
    version: '1.0',
    rules: [
      {
        id: 'r',
        when: { exists: { in: 'nodes', where: { path: 'x', op: 'exists' }, extra: 1 } },
        severity: 'info',
      },
    ],
  }
  assert.equal(
    createRuleValidator()(extraKey),
    false,
    'extra key in quantifier body must fail validation',
  )
})

// --- Static source conformance (the layering guarantees) ----------------------

test('rule-engine.ts contains no eval/Function, no network, no clock/RNG, no node:* import', () => {
  const src = readFileSync(join(root, 'core', 'src', 'rule-engine.ts'), 'utf8')

  // The card's exact forbidden-code grep.
  assert.doesNotMatch(src, /eval\(|Function\(|new\s+Function/, 'no eval/Function anywhere')

  // No network CALLS or transport imports. Bare "http" is intentionally NOT the
  // probe: the JSON Schema $schema/$id are http(s) URIs (identifiers ajv never
  // fetches), not egress. We forbid the actual call/transport shapes instead.
  assert.doesNotMatch(
    src,
    /\bfetch\s*\(|\baxios\b|XMLHttpRequest|\bWebSocket\b/,
    'no network client calls',
  )
  assert.doesNotMatch(src, /from\s+['"](?:node:)?https?['"]/, 'no http(s) transport import')
  // No LLM/provider MODULE IMPORTS or SDK calls. Scoped to import specifiers and
  // call sites, not comment prose (the layering docs legitimately discuss the LLM).
  assert.doesNotMatch(
    src,
    /from\s+['"][^'"]*(?:openai|anthropic|\bllm)[^'"]*['"]/i,
    'no LLM/provider module import',
  )
  assert.doesNotMatch(src, /\b(?:openai|anthropic)\s*[.(]/i, 'no LLM/provider SDK call')

  // Deterministic: no clock, no RNG. Scoped to CALL sites (with parens) so the
  // doc comments that promise "no Date.now / no Math.random" are not self-flagged.
  assert.doesNotMatch(src, /Date\.now\s*\(|Math\.random\s*\(/, 'no clock or RNG call')

  // Isomorphic: no node:* import (test files may use node:*, the module may not).
  assert.doesNotMatch(src, /from\s+['"]node:/, 'the engine must not import from node:*')
})
