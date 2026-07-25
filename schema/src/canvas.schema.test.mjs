// C7 acceptance test.
//
// Named criterion (CardContract AC1): "schema validates the C5 Procure-to-Pay
// ontology (all nodes, decision branches, parallel join via multiple inbound
// edges + node-level waits-on, lanes, zones 1-8)".
//
// The schema is the deterministic contract; ajv is the validator; the fixtures
// are the C5 walkthrough encoded as data. This test proves the schema both
// ACCEPTS the real process and REJECTS malformed input - a schema that only
// accepts is not a contract. It also proves the event envelope + all 15 payload
// families (AC4/AC5) and that the schema-drift gate can go red (AC3, the red
// direction; the green direction is the gate's job in CI, not this test's).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const readJson = (p) => JSON.parse(readFileSync(here(p), 'utf8'))

const schema = readJson('../canvas.schema.json')
const canvas = readJson('../fixtures/procure-to-pay.canvas.json')
const events = readJson('../fixtures/event-envelope.samples.json')

function buildAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  ajv.addSchema(schema)
  return ajv
}

const ajv = buildAjv()
const validateCanvas = ajv.getSchema(schema.$id)
const validateEnvelope = ajv.getSchema(`${schema.$id}#/$defs/EventEnvelope`)

const clone = (o) => structuredClone(o)

// --- AC1: the schema accepts the full C5 Procure-to-Pay ontology --------------

test('the schema compiles and the envelope $def is resolvable', () => {
  assert.equal(typeof validateCanvas, 'function', 'root Canvas schema must be resolvable by $id')
  assert.equal(
    typeof validateEnvelope,
    'function',
    'EventEnvelope $def must be resolvable by $ref pointer',
  )
})

test('canvas.schema.json validates the C5 Procure-to-Pay canvas', () => {
  const ok = validateCanvas(canvas)
  assert.equal(
    ok,
    true,
    `fixture must validate; ajv errors:\n${JSON.stringify(validateCanvas.errors, null, 2)}`,
  )
})

test('all process-map nodes are present with the right five-shape composition', () => {
  // The C5 Zone-2 map: Start + 11 Steps + 3 Waits + 2 Decisions + End.
  // A literal shape count of the walkthrough is 18, not the "17" in the card
  // scope line - the discrepancy is flagged for the human reviewer. The test
  // asserts against the fixture's real composition, it does not silently pick 17.
  const by = (t) => canvas.nodes.filter((n) => n.type === t)
  assert.equal(
    canvas.nodes.length,
    18,
    'expected 18 mapped nodes (Start+11 Step+3 Wait+2 Decision+End)',
  )
  assert.equal(by('Start').length, 1)
  assert.equal(by('Step').length, 11)
  assert.equal(by('Wait').length, 3)
  assert.equal(by('Decision').length, 2)
  assert.equal(by('End').length, 1)
})

test('both Decision nodes carry at least two out-edges (branching is expressible)', () => {
  const decisions = canvas.nodes.filter((n) => n.type === 'Decision')
  assert.equal(decisions.length, 2)
  for (const d of decisions) {
    const outs = canvas.edges.filter((e) => e.from === d.id)
    assert.ok(outs.length >= 2, `Decision ${d.id} must have >=2 out-edges, has ${outs.length}`)
  }
})

test('the parallel join is modeled: multiple inbound edges + node-level waits_on', () => {
  // The SDD-2 handoff to C7: the 3-way match joins two independently-produced
  // documents (goods receipt + invoice). No sixth shape - the internal ontology
  // allows a node with multiple inbound edges and a waits_on dependency.
  const match = canvas.nodes.find((n) => Array.isArray(n.waits_on) && n.waits_on.length >= 2)
  assert.ok(match, 'a join node with waits_on of >=2 must exist')
  const inbound = canvas.edges.filter((e) => e.to === match.id)
  assert.ok(
    inbound.length >= 2,
    `join node ${match.id} must have >=2 inbound edges, has ${inbound.length}`,
  )
  assert.ok(match.waits_on.includes('n-record-gr'), 'join must wait on the goods-receipt node')
  assert.ok(match.waits_on.includes('n-receive-invoice'), 'join must wait on the invoice node')
})

test('the exception rework path is a backward edge', () => {
  const back = canvas.edges.filter((e) => e.kind === 'exception-backedge')
  assert.ok(back.length >= 1, 'the exception loop must be a backward edge')
})

test('every lane/actor is present and every node references a real lane', () => {
  assert.ok(canvas.lanes.length >= 5, `expected >=5 lanes, got ${canvas.lanes.length}`)
  const laneIds = new Set(canvas.lanes.map((l) => l.id))
  for (const n of canvas.nodes) {
    assert.ok(laneIds.has(n.lane), `node ${n.id} references unknown lane ${n.lane}`)
  }
})

test('zones 1-8 are all populated across the three phases', () => {
  const ids = canvas.zones.map((z) => z.id).sort((a, b) => a - b)
  assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8])
  const phases = new Set(canvas.zones.map((z) => z.phase))
  assert.deepEqual([...phases].sort(), ['Converge', 'Diverge', 'Understand'])
})

test('the zone-3 friction and zone-4 audit evidence layers are present', () => {
  assert.ok(canvas.friction.length >= 5, 'DOWNTIME friction must be captured')
  const matchTag = canvas.audit_tags.find((a) => a.node_id === 'd-match')
  assert.ok(matchTag, 'the match step must carry a zone-4 audit tag')
  assert.equal(
    matchTag.exceptions,
    'frequent',
    'the match step is the frequent-exception automation profile',
  )
})

// --- AC1 red path: the schema REJECTS malformed input -------------------------

test('a node with a bogus type is rejected', () => {
  const bad = clone(canvas)
  bad.nodes[1].type = 'Frobnicate'
  assert.equal(validateCanvas(bad), false, 'unknown node type must fail validation')
})

test('a canvas missing a required Frame field is rejected', () => {
  const bad = clone(canvas)
  delete bad.process.north_star
  assert.equal(validateCanvas(bad), false, 'missing north_star (the anchor metric) must fail')
})

test('a join whose waits_on is not a list of node ids is rejected', () => {
  const bad = clone(canvas)
  const match = bad.nodes.find((n) => Array.isArray(n.waits_on))
  match.waits_on = 42
  assert.equal(validateCanvas(bad), false, 'waits_on must be an array of ids')
})

// --- v0.4: per-type detail panels, confidence tags, handoff edges -------------

test('v0.4 per-type detail panels validate on their node types', () => {
  const c = clone(canvas)
  const step = c.nodes.find((n) => n.type === 'Step')
  step.step_detail = {
    systems: ['ERP', 'Excel'],
    touch_time: { value: '8 min', confidence: 'gut-feel' },
    elapsed_time: { value: '2 days', confidence: 'log-checked' },
    frequency: { value: '400/mo', confidence: 'verified' },
    rework: true,
    batch: 'one-by-one',
    standardized: 'improvised',
    evidence: 'shoe-1',
  }
  const decision = c.nodes.find((n) => n.type === 'Decision')
  decision.decision_detail = {
    question: 'Does it match within tolerance?',
    basis: 'written-rule',
    decider: 'AP clerk',
    rule_ref: 'R2',
  }
  const wait = c.nodes.find((n) => n.type === 'Wait')
  wait.wait_detail = {
    duration: { value: '1 day', confidence: 'gut-feel' },
    duration_worst: { value: '5 days' },
    waiting_on: 'internal-approval',
    chasing: true,
    release_trigger: 'approver signs off',
  }
  assert.equal(
    validateCanvas(c),
    true,
    `v0.4 detail panels must validate; errors:\n${JSON.stringify(validateCanvas.errors, null, 2)}`,
  )
})

test('v0.4 handoff edges validate (medium / trigger / branch_share)', () => {
  const c = clone(canvas)
  const decision = c.nodes.find((n) => n.type === 'Decision')
  const out = c.edges.find((e) => e.from === decision.id)
  out.medium = 're-key'
  out.trigger = 'pull'
  out.branch_share = 70
  assert.equal(
    validateCanvas(c),
    true,
    `v0.4 handoff edge fields must validate; errors:\n${JSON.stringify(validateCanvas.errors, null, 2)}`,
  )
})

test('v0.4 additions are optional: the base fixture carries none and still validates', () => {
  // Additive-compat proof: the base C5 fixture predates v0.4 and has no detail
  // panels or handoff fields, yet validates (the AC1 test above). Assert the new
  // fields are genuinely absent so optionality is what is being exercised.
  for (const n of canvas.nodes) {
    assert.ok(
      !('step_detail' in n) && !('decision_detail' in n) && !('wait_detail' in n),
      `base fixture node ${n.id} should carry no v0.4 detail`,
    )
  }
  assert.equal(validateCanvas(canvas), true)
})

test('a bogus confidence tag is rejected', () => {
  const c = clone(canvas)
  const step = c.nodes.find((n) => n.type === 'Step')
  step.step_detail = { touch_time: { value: '8 min', confidence: 'vibes' } }
  assert.equal(validateCanvas(c), false, 'confidence must be one of the four source grades')
})

test('an out-of-range branch_share is rejected', () => {
  const c = clone(canvas)
  c.edges[0].branch_share = 140
  assert.equal(validateCanvas(c), false, 'branch_share must be 0-100')
})

test('an unknown field inside a detail panel is rejected', () => {
  const c = clone(canvas)
  const step = c.nodes.find((n) => n.type === 'Step')
  step.step_detail = { bogus: true }
  assert.equal(
    validateCanvas(c),
    false,
    'detail panels are closed objects (additionalProperties:false)',
  )
})

// --- AC4 + AC5: event envelope + all 15 payload families ----------------------

const FAMILY_TYPES = [
  'session.started',
  'zone.completed',
  'node.created',
  'edge.created',
  'friction.pinned',
  'audit_tag.set',
  'opportunity.created',
  'score.committed',
  'challenge.raised',
  'gate.checked',
  'case.drafted',
  'flag.accepted',
  'rule.fired',
  'budget.spent',
  'agent.message',
]

test('there is exactly one sample event per payload family (15)', () => {
  assert.equal(events.length, 15)
  const types = events.map((e) => e.type).sort()
  assert.deepEqual(types, [...FAMILY_TYPES].sort())
})

test('every sample event validates against the envelope contract', () => {
  for (const e of events) {
    const ok = validateEnvelope(e)
    assert.equal(
      ok,
      true,
      `event ${e.type} must validate; errors:\n${JSON.stringify(validateEnvelope.errors, null, 2)}`,
    )
  }
})

test('an event with an unknown type is rejected', () => {
  const bad = clone(events[0])
  bad.type = 'bogus.type'
  assert.equal(validateEnvelope(bad), false, 'unknown event type must fail')
})

test('an event whose payload matches no family is rejected', () => {
  const bad = clone(events[0])
  bad.payload = {}
  assert.equal(validateEnvelope(bad), false, 'an empty payload matches no family in the oneOf')
})

// --- v0.4: new content events + LLM contracts ---------------------------------

const UUID = '00000000-0000-4000-8000-000000000000'
function env(type, payload) {
  return {
    event_id: UUID,
    session_id: UUID,
    seq: 1,
    type,
    author: { kind: 'human', id: 'local-user' },
    provenance: { state: 'ink' },
    payload,
    correlation_id: UUID,
    schema_version: '1.2',
    ts: '2026-07-12T10:00:00.000Z',
  }
}

const V04_EVENTS = [
  [
    'commitment',
    { opportunity_ids: ['o-1'], signed_by: 'Aleks', statement: 'I commit these scores.' },
  ],
  ['step.reassigned', { node_id: 'n-1', from_lane: 'l-ap', to_lane: 'l-buyer' }],
  [
    'tobe.snapshot.accepted',
    {
      opportunity_id: 'o-1',
      changes: [{ element_ref: 'n-1', rung: 'Automate', note: 'actor -> system' }],
      delta: { cycle_time: '-1 day', handoff_count: -2 },
    },
  ],
  [
    'shoebox.item.added',
    { item_id: 'shoe-1', kind: 'file', name: 'recon.csv', content_type: 'text/csv' },
  ],
  ['shoebox.item.consented', { item_id: 'shoe-1' }],
  [
    'extraction.result',
    {
      source_item_id: 'shoe-1',
      chips: [
        { text: 'month-end reconciliation not on the map', suggests: 'add a reconciliation step' },
      ],
    },
  ],
  [
    'challenge.issued',
    {
      opportunity_id: 'o-1',
      tier: 'challenge',
      dimension: 'benefit',
      message: 'Benefit 5 rests on a gut-feel touch time.',
      cited_refs: ['n-1'],
    },
  ],
  ['challenge.answered', { opportunity_id: 'o-1', response: 'revised', note: 'lowered to 3' }],
  ['checkpoint.exported', { checkpoint: 'friction-map', format: 'png' }],
]

test('every v0.4 content event validates against the envelope (oneOf stays disjoint)', () => {
  // A payload that matched two families would fail the oneOf, so passing here is
  // also proof the new families are disjoint from the existing 17.
  for (const [type, payload] of V04_EVENTS) {
    const ok = validateEnvelope(env(type, payload))
    assert.equal(
      ok,
      true,
      `${type} must validate; errors:\n${JSON.stringify(validateEnvelope.errors, null, 2)}`,
    )
  }
})

test('every v0.4 event type is wired into the EventType enum', () => {
  const evTypes = schema.$defs.EventType.enum
  for (const [type] of V04_EVENTS) {
    assert.ok(evTypes.includes(type), `${type} must be in EventType`)
  }
})

test('a commitment with an empty opportunity_ids is rejected', () => {
  assert.equal(
    validateEnvelope(env('commitment', { opportunity_ids: [] })),
    false,
    'commitment must seal at least one opportunity',
  )
})

test('a challenge.issued with no cited evidence is rejected', () => {
  assert.equal(
    validateEnvelope(
      env('challenge.issued', {
        opportunity_id: 'o-1',
        tier: 'probe',
        message: 'hmm',
        cited_refs: [],
      }),
    ),
    false,
    'every challenge must cite >=1 element (the evidence line)',
  )
})

test('the v0.4 LLM contracts are resolvable and enforce their shapes', () => {
  const extraction = ajv.getSchema(`${schema.$id}#/$defs/ExtractionOutput`)
  const composer = ajv.getSchema(`${schema.$id}#/$defs/ComposerNamingOutput`)
  const challenge = ajv.getSchema(`${schema.$id}#/$defs/ChallengeIssuedOutput`)
  assert.equal(extraction({ chips: [{ text: 'x' }] }), true)
  assert.equal(composer({ name: 'Lean P2P', narrative: 'shorter loop' }), true)
  assert.equal(challenge({ message: 'cite this', cited_refs: ['n-1'] }), true)
  assert.equal(
    challenge({ message: 'no cite', cited_refs: [] }),
    false,
    'challenge output must cite >=1',
  )
})

// --- v0.4: the separate presentation stream (geometry) ------------------------

const validatePresentation = ajv.getSchema(`${schema.$id}#/$defs/PresentationEnvelope`)
const validatePresState = ajv.getSchema(`${schema.$id}#/$defs/PresentationState`)

function penv(type, payload) {
  return { event_id: UUID, session_id: UUID, seq: 0, type, payload, ts: '2026-07-12T10:00:00.000Z' }
}

const PRES_EVENTS = [
  ['node.moved', { node_id: 'n-1', position: { x: 120, y: -40 } }],
  ['frame.moved', { frame_id: 'zone-2', position: { x: 0, y: 0 } }],
  ['frame.resized', { frame_id: 'zone-2', size: { w: 800, h: 600 } }],
  ['frame.collapsed', { frame_id: 'shoebox', collapsed: true }],
]

test('every presentation event validates against the PresentationEnvelope', () => {
  for (const [type, payload] of PRES_EVENTS) {
    assert.equal(
      validatePresentation(penv(type, payload)),
      true,
      `${type} must validate; errors:\n${JSON.stringify(validatePresentation.errors, null, 2)}`,
    )
  }
})

test('the presentation and content streams are separate: neither envelope accepts the other', () => {
  assert.equal(
    validatePresentation(
      env('node.created', { node: { id: 'n-1', type: 'Step', lane: 'l', label: 'x' } }),
    ),
    false,
    'a content envelope carries fields the closed presentation envelope forbids',
  )
  assert.equal(
    validateEnvelope(penv('node.moved', { node_id: 'n-1', position: { x: 1, y: 2 } })),
    false,
    'a presentation envelope lacks provenance/author/correlation and its type is not an EventType',
  )
})

test('a presentation envelope carries no provenance (geometry has no ink/pencil)', () => {
  const withProv = {
    ...penv('node.moved', { node_id: 'n-1', position: { x: 1, y: 2 } }),
    provenance: { state: 'ink' },
  }
  assert.equal(
    validatePresentation(withProv),
    false,
    'the presentation envelope is closed - no provenance field',
  )
})

test('PresentationState projects node positions and frame geometry', () => {
  const state = {
    nodes: [{ node_id: 'n-1', position: { x: 10, y: 20 } }],
    frames: [
      { frame_id: 'zone-2', position: { x: 0, y: 0 }, size: { w: 800, h: 600 }, collapsed: false },
    ],
  }
  assert.equal(validatePresState(state), true)
  assert.equal(
    validatePresState({}),
    true,
    'empty presentation state is valid (default composition)',
  )
})

// --- AC3 (red direction): the schema-drift gate goes red on drift -------------

test('the schema-drift gate FAILS when committed types drift from the schema', () => {
  const repoRoot = here('../../')
  const gate = join(repoRoot, 'scripts/gates/schema-drift.mjs')
  // Corrupt a throwaway copy of the committed types so any regeneration differs,
  // and point the gate at it via SCHEMA_DRIFT_TYPES. Proves drift is CI-red
  // without touching the real committed file.
  const committed = readFileSync(here('./canvas.types.ts'), 'utf8')
  const dir = mkdtempSync(join(tmpdir(), 'drift-'))
  const drifted = join(dir, 'canvas.types.ts')
  writeFileSync(drifted, committed + '\n// drift introduced by the test\n')
  const r = spawnSync(process.execPath, [gate], {
    encoding: 'utf8',
    env: { ...process.env, SCHEMA_DRIFT_TYPES: drifted },
  })
  assert.notEqual(
    r.status,
    0,
    `expected the drift gate to fail; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
  )
  assert.match(r.stderr, /schema-drift: FAIL/, 'failure output should name the gate')
})
