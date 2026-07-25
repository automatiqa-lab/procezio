// C9 acceptance test.
//
// Named criterion (CardContract, ImplPlan.testName):
//   'projection over a 15-family non-trivial event log is deterministic and
//    replay-isomorphic: project(all_events_1..N) equals load(snapshot_at_K +
//    tail_events_K+1..N) for a snapshot taken via takeSnapshot, and re-projecting
//    from seq 1 after discarding all snapshots yields byte-identical (deep-equal,
//    JSON.stringify-identical) Canvas state across repeated runs'
//
// Projection is the deterministic READ side of the event log. This test proves,
// against the SAME corpus the schema/store tests use (the 15 payload families in
// schema/fixtures/event-envelope.samples.json), that the fold is (1) byte-
// identical across repeated runs, (2) isomorphic under snapshot+tail loading,
// (3) disposable - discarding snapshots and re-projecting from seq 1 reproduces
// identical state.
//
// Resolution mirrors event-store.test.ts: node --test runs from the repo root,
// so fixtures and source are read via process.cwd(), independent of where this
// compiles to (core/dist under the tsc build). The projection module itself may
// not touch node:* - THIS test file may, and uses node:fs only to (a) load the
// fixture and (b) statically scan the projection source for forbidden node
// imports / clock / randomness calls.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Author, Canvas, EventEnvelope, FlagPayload } from '@procezio/schema'
import { project, takeSnapshot, loadFromSnapshot, provenanceOf } from './projection.js'
import { createCompensatingEvent } from './compensate.js'

const root = process.cwd()
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(root, rel), 'utf8'))

const clone = <T>(o: T): T => structuredClone(o)
const str = (c: Canvas): string => JSON.stringify(c)

// The 15 payload families, one event each, all in one session. The fixture
// carries seq 0..14; reassemble into a single ordered per-session log with
// corrected sequential seq 1..15 (seq is the store's authority, C8).
const samples = readJson('schema/fixtures/event-envelope.samples.json') as EventEnvelope[]
const events: EventEnvelope[] = samples.map((e, i) => ({ ...clone(e), seq: i + 1 }))

// Sanity: the corpus really does exercise all 15 families in one session.
assert.equal(events.length, 15, 'fixture must carry all 15 payload families')
assert.equal(
  new Set(events.map((e) => e.session_id)).size,
  1,
  'the reassembled log is a single session',
)

// --- The named acceptance test ------------------------------------------------

test('projection over a 15-family non-trivial event log is deterministic and replay-isomorphic: project(all_events_1..N) equals load(snapshot_at_K + tail_events_K+1..N) for a snapshot taken via takeSnapshot, and re-projecting from seq 1 after discarding all snapshots yields byte-identical (deep-equal, JSON.stringify-identical) Canvas state across repeated runs', () => {
  // (1) Deterministic: same events in same order -> byte-identical state, and
  // the fold does not mutate its input (a deep clone projects identically).
  const a = project(events)
  const b = project(clone(events))
  assert.equal(str(a), str(b), 'projection must be byte-identical across runs')
  assert.deepEqual(a, b, 'projection must be deep-equal across runs')

  // (2) Snapshot + tail replay is isomorphic. Take snapshots with a small N so
  // BOTH triggers fire: the every-N interval (seq 5,10,15) and zone.completed
  // (seq 2). Load from the seq-5 snapshot with the seq 6..15 tail and prove it
  // equals a full projection.
  const snapshots = takeSnapshot(events, { snapshotEvery: 5 })
  assert.deepEqual(
    snapshots.map((s) => s.seq),
    [2, 5, 10, 15],
    'snapshots taken every N=5 AND on zone.completed (seq 2)',
  )

  const K = 5
  const snapshotAtK = snapshots.find((s) => s.seq === K)
  assert.ok(snapshotAtK, 'a snapshot at seq K must exist')
  const tail = events.filter((e) => e.seq > K) // seq K+1..N
  assert.equal(tail.length, events.length - K, 'tail is exactly seq K+1..N')

  const loaded = loadFromSnapshot(snapshotAtK, tail)
  const full = project(events)
  assert.equal(
    str(loaded),
    str(full),
    'load(snapshot_at_K + tail) must be byte-identical to project(all)',
  )
  assert.deepEqual(loaded, full, 'snapshot+replay must be deep-equal to full projection')

  // (3) Snapshots are disposable: discard every snapshot and re-project from
  // seq 1 - identical state, across repeated runs (byte-identical each time).
  const reprojected1 = project(events)
  const reprojected2 = project(clone(events))
  assert.equal(str(reprojected1), str(full), 're-projection from seq 1 equals the original')
  assert.equal(str(reprojected2), str(full), 're-projection is stable across repeated runs')

  // Loading must not have mutated the cached snapshot (still disposable/reusable):
  // re-load from the same snapshot record yields the same result.
  const loadedAgain = loadFromSnapshot(snapshotAtK, tail)
  assert.equal(str(loadedAgain), str(full), 'the cached snapshot is reusable, not consumed')
})

// --- M2-AMD1: the v0.3->v1.1 amendment folds (frame.set + assumption.added) ---
//
// The amendment corpus is a SEPARATE fixture (schema/fixtures/amendment-v1.1.samples.json,
// schema_version '1.1'), kept out of event-envelope.samples.json so the ratified
// 15-family corpus and its exact-count assertions never move.
const amendment = readJson('schema/fixtures/amendment-v1.1.samples.json') as EventEnvelope[]

test('projection folds frame.set by merging only the present FramePayload fields onto canvas.process (absent fields keep their prior values), proving frame.set patches Frame fields onto canvas.process correctly', () => {
  // A minimal ordered log: session.started sets ONLY the process name (samples[0],
  // schema_version 1.0), then two v1.1 frame.set events each carrying a DISJOINT
  // partial patch - the first {trigger, north_star}, the second {owner}. seq is
  // reassigned sequentially (project() does not read seq; this only keeps the log
  // envelope-shaped).
  const sessionStarted = samples[0] as EventEnvelope
  assert.equal(sessionStarted.type, 'session.started', 'samples[0] is session.started')
  const frameSets = amendment.filter((e) => e.type === 'frame.set')
  assert.equal(frameSets.length, 2, 'the amendment fixture carries two frame.set events')
  // Confirm the fixture ordering the assertions below depend on: first patch carries
  // trigger+north_star (not owner); second carries owner (not trigger).
  const first = frameSets[0]?.payload as { trigger?: string; north_star?: string; owner?: string }
  const second = frameSets[1]?.payload as { trigger?: string; owner?: string }
  assert.ok(
    first.trigger && first.north_star && first.owner === undefined,
    'frame.set[0] = {trigger, north_star}',
  )
  assert.ok(second.owner && second.trigger === undefined, 'frame.set[1] = {owner}')

  const log: EventEnvelope[] = [sessionStarted, ...frameSets].map((e, i) => ({
    ...clone(e),
    seq: i + 1,
  }))
  const c = project(log)

  // name survives from session.started - a later frame.set that never mentions
  // name must not blank it.
  assert.equal(c.process.name, 'Procure-to-Pay, indirect goods', 'name kept from session.started')
  // trigger + north_star come from the FIRST frame.set...
  assert.equal(c.process.trigger, first.trigger, 'trigger patched from frame.set[0]')
  assert.equal(c.process.north_star, first.north_star, 'north_star patched from frame.set[0]')
  // ...and survive the SECOND frame.set, which only carried owner (absent fields
  // keep their prior values - the merge is a partial patch, not a replace).
  assert.equal(c.process.owner, second.owner, 'owner patched from frame.set[1]')
  // end_state was never supplied by any event, so it keeps the emptyCanvas default
  // rather than being blanked or invented.
  assert.equal(c.process.end_state, '', 'end_state, never set, keeps its emptyCanvas default')

  // Determinism holds for the amended fold too.
  assert.equal(str(project(clone(log))), str(c), 'frame.set fold is byte-identical across runs')
})

test('projection folds assumption.added by appending each Assumption to canvas.assumptions in log order', () => {
  // Two assumption.added events append two ledger entries in log order (the ledger
  // has no element id, so entries are appended, never upserted).
  const added = amendment
    .filter((e) => e.type === 'assumption.added')
    .map((e, i) => ({ ...clone(e), seq: i + 1 }) as EventEnvelope)
  assert.equal(added.length, 2, 'the amendment fixture carries two assumption.added events')

  const c = project(added)
  assert.equal(c.assumptions?.length, 2, 'both assumptions land in canvas.assumptions')
  const p0 = added[0]?.payload as { assumption: { statement: string } }
  const p1 = added[1]?.payload as { assumption: { statement: string } }
  assert.equal(
    c.assumptions?.[0]?.statement,
    p0.assumption.statement,
    'first entry is the first event, in order',
  )
  assert.equal(
    c.assumptions?.[1]?.statement,
    p1.assumption.statement,
    'second entry follows, order preserved',
  )

  // A projection with no assumption.added leaves the ledger an empty array (not
  // undefined), so serialization order is stable from seq 0.
  assert.deepEqual(project([]).assumptions, [], 'the ledger defaults to an empty array')
})

test('assumption.added with an id UPSERTS: same id replaces in place, an id adopts a matching id-less entry, unrelated entries append (v0.4 amendment)', () => {
  // Reuse a valid amendment envelope as the shell; only the payload varies per event.
  const shell = amendment.find((e) => e.type === 'assumption.added') as EventEnvelope
  const at = (i: number, assumption: object): EventEnvelope =>
    ({
      ...clone(shell),
      event_id: `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      seq: i,
      payload: { assumption },
    }) as EventEnvelope

  const legacy = { statement: 'S1', source: 'Zone 1', confidence: 'low' } // pre-amendment, no id
  const adopt = {
    id: 'as-1',
    statement: 'S1',
    source: 'Zone 1',
    confidence: 'low',
    verify_by: 'ask the doer',
  }
  const revised = {
    id: 'as-1',
    statement: 'S1 (sharper)',
    source: 'Zone 1',
    confidence: 'med',
    verify_by: 'ask the doer',
  }
  const other = { id: 'as-2', statement: 'S2', source: 'Zone 4', confidence: 'high' }

  // Rule 2: an id-carrying re-flag ADOPTS the id-less entry with the same statement+source.
  let c = project([at(1, legacy), at(2, adopt)])
  assert.equal(
    c.assumptions?.length,
    1,
    'acknowledging a legacy entry replaces it, never duplicates',
  )
  assert.equal(c.assumptions?.[0]?.verify_by, 'ask the doer', 'the verify plan landed in place')
  assert.equal(c.assumptions?.[0]?.id, 'as-1', 'the adopted entry now carries the id')

  // Rule 1 + 3: same id replaces in place; a different id appends.
  c = project([at(1, legacy), at(2, adopt), at(3, other), at(4, revised)])
  assert.equal(c.assumptions?.length, 2, 'same-id upsert never grows the ledger')
  assert.equal(
    c.assumptions?.[0]?.statement,
    'S1 (sharper)',
    'the same-id revision replaced entry 0 IN PLACE',
  )
  assert.equal(c.assumptions?.[1]?.id, 'as-2', 'the unrelated entry appended after it')

  // Id-less events keep the historical append-only behavior (old logs replay unchanged).
  c = project([at(1, legacy), at(2, legacy)])
  assert.equal(c.assumptions?.length, 2, 'id-less duplicates still append, as they always did')
})

// --- Per-family: each family lands in the correct Canvas field ----------------

test('each additive family folds into the correct Canvas field', () => {
  const c = project(events)

  // session.started -> process name + schema_version from the envelope
  assert.equal(
    c.process.name,
    'Procure-to-Pay, indirect goods',
    'session.started sets process name',
  )
  assert.equal(c.schema_version, '1.0', 'schema_version taken from the session.started envelope')

  // zone.completed -> zones (id + phase from the event)
  assert.deepEqual(
    c.zones,
    [{ id: 1, phase: 'Understand', name: '' }],
    'zone.completed builds zones',
  )

  // node.created -> nodes, and lanes derived from node.lane
  assert.equal(c.nodes.length, 1, 'node.created builds one node')
  assert.equal(c.nodes[0]?.id, 'n-raise-req', 'the created node lands in nodes')
  assert.deepEqual(
    c.lanes,
    [{ id: 'requester', actor: 'requester' }],
    'lanes derived from node.lane',
  )

  // edge.created -> edges
  assert.equal(c.edges.length, 1, 'edge.created builds one edge')
  assert.equal(c.edges[0]?.id, 'e2', 'the created edge lands in edges')

  // friction.pinned -> friction
  assert.equal(c.friction?.length, 1, 'friction.pinned builds one friction')
  assert.equal(c.friction?.[0]?.id, 'f1', 'the pinned friction lands in friction')

  // audit_tag.set -> audit_tags
  assert.equal(c.audit_tags?.length, 1, 'audit_tag.set builds one audit tag')
  assert.equal(c.audit_tags?.[0]?.id, 'a4', 'the audit tag lands in audit_tags')

  // opportunity.created + score.committed -> opportunities, score attached
  assert.equal(c.opportunities?.length, 1, 'opportunity.created builds one opportunity')
  const op = c.opportunities?.[0]
  assert.equal(op?.id, 'op-auto-match', 'the opportunity lands in opportunities')
  assert.deepEqual(
    op?.score,
    { benefit: 4.7, effort: 2.0 },
    'score.committed sets Opportunity.score',
  )
  assert.equal(op?.committed, true, 'score.committed marks the opportunity committed')

  // gate.checked -> gates (M2-AMD2), case.drafted -> cases (M2-AMD2)
  assert.equal(c.gates?.length, 1, 'gate.checked builds one gate')
  assert.equal(c.gates?.[0]?.check, 'failure-blast-radius', 'the gate carries its check')
  assert.equal(c.gates?.[0]?.status, 'open', 'the gate carries its status')
  assert.equal(c.cases?.length, 1, 'case.drafted builds one case')
  assert.equal(
    c.cases?.[0]?.opportunity_id,
    'op-auto-match',
    'the case is keyed to its opportunity',
  )
})

// --- M2-AMD2: gate/case upsert keys (composite for gates, opportunity for cases) --

test('gate.checked upserts by (opportunity, check) and case.drafted upserts by opportunity_id', () => {
  // Reuse the corpus gate.checked / case.drafted envelopes as templates.
  const gateEvt = events.find((e) => e.type === 'gate.checked')!
  const caseEvt = events.find((e) => e.type === 'case.drafted')!
  const withPayload = (tpl: EventEnvelope, payload: unknown, seq: number): EventEnvelope =>
    ({ ...clone(tpl), payload: clone(payload) as EventEnvelope['payload'], seq }) as EventEnvelope

  const OPP = 'op-auto-match'
  // Two DIFFERENT checks on the same opportunity -> two gate rows.
  const g1 = withPayload(gateEvt, { opportunity_id: OPP, check: 'data-privacy', status: 'open' }, 1)
  const g2 = withPayload(
    gateEvt,
    { opportunity_id: OPP, check: 'accountability', status: 'open' },
    2,
  )
  // Re-check the FIRST check, now cleared -> replaces in place (still two rows).
  const g1b = withPayload(
    gateEvt,
    { opportunity_id: OPP, check: 'data-privacy', status: 'cleared' },
    3,
  )

  const afterGates = project([g1, g2, g1b])
  assert.equal(afterGates.gates?.length, 2, 're-checking a check replaces in place, not stacks')
  const dp = afterGates.gates?.find((g) => g.check === 'data-privacy')
  assert.equal(dp?.status, 'cleared', 'the composite (opportunity, check) key upserts the status')

  // Two drafts for the same opportunity -> one case, the later replacing the earlier.
  const c1 = withPayload(caseEvt, { opportunity_id: OPP, figures: [], assumptions: [] }, 4)
  const c2 = withPayload(
    caseEvt,
    {
      opportunity_id: OPP,
      figures: [{ label: 'rework', value: '40h/mo', source_ref: 'f2' }],
      assumptions: [],
    },
    5,
  )
  const afterCases = project([c1, c2])
  assert.equal(
    afterCases.cases?.length,
    1,
    'a redraft replaces the prior case (upsert by opportunity_id)',
  )
  assert.equal(afterCases.cases?.[0]?.figures?.length, 1, 'the later draft wins')
})

test('non-state-building families (challenge/flag/rule/budget/message) do not alter canvas ontology fields', () => {
  // The projection over the full log must equal the projection over just the
  // additive families - the remaining interaction families contribute nothing to
  // Canvas. gate.checked and case.drafted became additive in M2-AMD2 (they build
  // canvas.gates / canvas.cases), so they belong to the additive set now; only
  // challenge/flag/rule/budget/message stay inert.
  const additive = new Set([
    'session.started',
    'zone.completed',
    'node.created',
    'edge.created',
    'friction.pinned',
    'audit_tag.set',
    'opportunity.created',
    'score.committed',
    'gate.checked',
    'case.drafted',
    'frame.set',
    'assumption.added',
  ])
  const full = project(events)
  const additiveOnly = project(events.filter((e) => additive.has(e.type)))
  assert.equal(
    str(full),
    str(additiveOnly),
    'audit/interaction families are inert for canvas projection',
  )
})

// --- Purity: the projection module has no node:*, no clock, no randomness -----

test('projection.ts imports nothing from node:*, and calls no Date.now / Math.random', () => {
  const raw = readFileSync(join(root, 'core', 'src', 'projection.ts'), 'utf8')
  // Scan EXECUTABLE code, not prose: strip block and line comments first so the
  // header's own mention of "Date.now()" / "Math.random()" is not a false hit.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(src, /from\s+['"]node:/, 'projection must not import from node:*')
  const BUILTINS = [
    'fs',
    'path',
    'os',
    'crypto',
    'util',
    'child_process',
    'stream',
    'http',
    'https',
    'net',
    'url',
    'events',
    'buffer',
    'process',
    'assert',
  ]
  const bare = new RegExp(`from\\s+['"](?:${BUILTINS.join('|')})['"]`)
  assert.doesNotMatch(src, bare, 'projection must not import a bare node builtin')
  assert.doesNotMatch(src, /Date\.now\(/, 'the fold must not read the clock')
  assert.doesNotMatch(src, /Math\.random\(/, 'the fold must not use randomness')
})

// --- C10: compensating undo/redo and two-ink provenance -----------------------
//
// samples[2] is the agent-authored node.created for node 'n-raise-req' (born
// pencil); samples[11] is the human flag.accepted whose target_event_id is that
// same node.created event. Both are reused verbatim as the C10 fixtures.

const HUMAN: Author = { kind: 'human', id: 'user-1' }
const TS = '2026-07-06T12:00:00Z'
const NODE_KEY = 'node:n-raise-req'
const env = (i: number): EventEnvelope => clone(samples[i] as EventEnvelope)
// Attach a seq so a bare EventCandidate is a fold-ready EventEnvelope. project()
// does not read seq, so the exact value is immaterial to the fold - it only
// satisfies the envelope shape.
const seqd = (candidate: Omit<EventEnvelope, 'seq'>, seq: number): EventEnvelope =>
  ({ ...candidate, seq }) as EventEnvelope

test('Appending a compensating event for a node.created target makes that node absent from the projection while the target event remains in the log', () => {
  const nodeCreated = seqd(env(2), 1)
  assert.equal(nodeCreated.type, 'node.created', 'fixture[2] is the node.created event')

  // Before compensation the node projects normally.
  const before = project([nodeCreated])
  assert.ok(
    before.nodes.some((n) => n.id === 'n-raise-req'),
    'the node is present in the projection before compensation',
  )

  // Append (never delete) a compensating event that targets it.
  const undo = seqd(
    createCompensatingEvent(nodeCreated, { eventId: 'undo-1', ts: TS, author: HUMAN }),
    2,
  )
  const log: EventEnvelope[] = [nodeCreated, undo]
  const after = project(log)

  // The node is gone from the projection...
  assert.ok(
    !after.nodes.some((n) => n.id === 'n-raise-req'),
    'the node is absent from the projection after compensation',
  )
  // ...while the target event is still in the log, unchanged (append-only).
  const stillThere = log.find((e) => e.event_id === nodeCreated.event_id)
  assert.ok(stillThere, 'the target node.created event remains in the log')
  assert.equal(stillThere?.type, 'node.created', 'the target event is unchanged in the log')
  assert.equal(log.length, 2, 'compensation appends a second event; nothing is deleted')
})

test('redo (a compensating event targeting the undo) restores the original effect: net = original applied', () => {
  const nodeCreated = seqd(env(2), 1)
  const undo = seqd(
    createCompensatingEvent(nodeCreated, { eventId: 'undo-1', ts: TS, author: HUMAN }),
    2,
  )
  const redo = seqd(createCompensatingEvent(undo, { eventId: 'redo-1', ts: TS, author: HUMAN }), 3)
  const withRedo = project([nodeCreated, undo, redo])
  const original = project([nodeCreated])
  assert.ok(
    withRedo.nodes.some((n) => n.id === 'n-raise-req'),
    'redo restores the node',
  )
  assert.deepEqual(withRedo, original, 'redo of undo nets to exactly the original applied state')
})

test('projection handles compensation-of-a-compensation: undo/redo/undo (odd) nets removed, one more (even) nets present', () => {
  const nodeCreated = seqd(env(2), 1)
  const u1 = seqd(createCompensatingEvent(nodeCreated, { eventId: 'u1', ts: TS, author: HUMAN }), 2)
  const u2 = seqd(createCompensatingEvent(u1, { eventId: 'u2', ts: TS, author: HUMAN }), 3)
  const u3 = seqd(createCompensatingEvent(u2, { eventId: 'u3', ts: TS, author: HUMAN }), 4)

  const odd = project([nodeCreated, u1, u2, u3])
  assert.ok(
    !odd.nodes.some((n) => n.id === 'n-raise-req'),
    'an odd-depth chain (3 compensations) nets to removed',
  )

  const u4 = seqd(createCompensatingEvent(u3, { eventId: 'u4', ts: TS, author: HUMAN }), 5)
  const even = project([nodeCreated, u1, u2, u3, u4])
  assert.deepEqual(
    even,
    project([nodeCreated]),
    'an even-depth chain (4 compensations) nets back to the original applied state',
  )
})

test('a flag.accepted (accepted) event flips the target element provenance from pencil to ink', () => {
  const nodeCreated = seqd(env(2), 1) // agent-authored -> born pencil
  const flag = seqd(env(11), 2) // human flag.accepted, decision accepted, targets node.created
  assert.equal(flag.type, 'flag.accepted', 'fixture[11] is the flag.accepted event')

  const born = provenanceOf([nodeCreated])
  assert.equal(born.get(NODE_KEY)?.state, 'pencil', 'the agent-created node is born pencil')

  const flipped = provenanceOf([nodeCreated, flag])
  const p = flipped.get(NODE_KEY)
  assert.equal(p?.state, 'ink', 'acceptance flips the element from pencil to ink')
  assert.equal(p?.accepted_by, flag.author.id, 'accepted_by is stamped from the accepting author')
  assert.equal(p?.accepted_at, flag.ts, 'accepted_at is stamped from the flag event ts')
})

test('a flag.accepted (rejected) event removes the target effect from the projection, like compensation', () => {
  const nodeCreated = seqd(env(2), 1)
  const reject = seqd(env(11), 2)
  ;(reject.payload as FlagPayload).decision = 'rejected'

  const canvas = project([nodeCreated, reject])
  assert.ok(
    !canvas.nodes.some((n) => n.id === 'n-raise-req'),
    'rejection removes the target node from the canvas',
  )
  const prov = provenanceOf([nodeCreated, reject])
  assert.equal(prov.get(NODE_KEY), undefined, 'rejection removes the element provenance entry')
})

test('human-authored events project ink provenance, agent-authored project pencil', () => {
  // samples[3] is a human edge.created (born ink); samples[2] an agent node.created.
  const humanEdge = seqd(env(3), 1)
  const agentNode = seqd(env(2), 2)
  const prov = provenanceOf([humanEdge, agentNode])
  assert.equal(prov.get('edge:e2')?.state, 'ink', 'a human-authored element is ink')
  assert.equal(prov.get(NODE_KEY)?.state, 'pencil', 'an agent-authored element is pencil')
})

// --- v0.4: step.reassigned, the one presentation->content crossover -----------

// The agent node.created sample (samples[2]) creates n-raise-req in its own lane; reuse its
// envelope scaffolding and swap in a human step.reassigned that moves it to a new owner lane.
function reassignEvent(seq: number, nodeId: string, fromLane: string, toLane: string) {
  return seqd(
    {
      ...clone(env(2)),
      type: 'step.reassigned',
      author: HUMAN,
      provenance: { state: 'ink' },
      schema_version: '1.2',
      payload: { node_id: nodeId, from_lane: fromLane, to_lane: toLane },
    } as Omit<EventEnvelope, 'seq'>,
    seq,
  )
}

test('step.reassigned moves a node to a new lane and ensures that lane (v0.4)', () => {
  const nodeCreated = seqd(env(2), 1)
  const nodeId = (nodeCreated.payload as { node: { id: string } }).node.id
  const originalLane = (nodeCreated.payload as { node: { lane: string } }).node.lane
  const c = project([nodeCreated, reassignEvent(2, nodeId, originalLane, 'buyer')])
  const node = c.nodes.find((n) => n.id === nodeId)
  assert.equal(node?.lane, 'buyer', 'the step now belongs to the new owner lane')
  assert.ok(
    c.lanes.some((l) => l.id === 'buyer'),
    'the destination lane is ensured, so no node references an orphan lane',
  )
})

test('undoing a step.reassigned restores from_lane (reversible when recorded)', () => {
  const nodeCreated = seqd(env(2), 1)
  const nodeId = (nodeCreated.payload as { node: { id: string } }).node.id
  const originalLane = (nodeCreated.payload as { node: { lane: string } }).node.lane
  const reassign = reassignEvent(2, nodeId, originalLane, 'buyer')
  const undo = seqd(
    createCompensatingEvent(reassign, { eventId: 'undo-1', ts: TS, author: HUMAN }),
    3,
  )
  const c = project([nodeCreated, reassign, undo])
  assert.equal(
    c.nodes.find((n) => n.id === nodeId)?.lane,
    originalLane,
    'the compensating event restores the original lane',
  )
})
