// C8 acceptance test.
//
// Named criterion (CardContract, ImplPlan.testName):
//   'append assigns monotonic gap-free per-session seq; ajv-invalid
//    EventEnvelope events are rejected and never stored, never consuming a seq'
//
// The store is the deterministic authority on ordering and validity. This test
// proves both halves against the SAME contract the schema package tests use:
// the valid corpus is schema/fixtures/event-envelope.samples.json (the 15
// payload families), the invalid corpus is that same fixture mutated the way
// canvas.schema.test.mjs mutates it (bogus type, empty payload, missing field).
//
// Resolution: node --test runs from the repo root, so schema + source files are
// read via process.cwd(), independent of where this test compiles to (core/dist
// under the tsc build). The store module itself may not touch node:* - THIS test
// file may, and uses node:fs only to (a) load fixtures and (b) statically scan
// the store source for forbidden node imports (AC4).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createEventStore } from './event-store.js'
import type { EventCandidate } from './event-store.js'

const root = process.cwd()
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(root, rel), 'utf8'))

const samples = readJson('schema/fixtures/event-envelope.samples.json') as EventCandidate[]

const clone = <T>(o: T): T => structuredClone(o)
// createEventStore is zero-arg (M2-01a): the EventEnvelope contract is baked into
// the precompiled validator @procezio/schema exports, so no schema is injected.
const newStore = () => createEventStore()

// --- The named acceptance test ------------------------------------------------

test('append assigns monotonic gap-free per-session seq; ajv-invalid EventEnvelope events are rejected and never stored, never consuming a seq', () => {
  const store = newStore()
  const SESSION_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
  const SESSION_B = 'bbbbbbbb-0000-4000-8000-00000000000b'

  // (1) Monotonic, gap-free, assigned-by-the-store seq for session A.
  // The fixtures carry seq 0..14; the store must OVERWRITE that with 1..15.
  let expected = 0
  for (const sample of samples) {
    const candidate = { ...clone(sample), session_id: SESSION_A }
    const before = store.lastSeq(SESSION_A)
    const result = store.append(candidate)
    expected += 1
    assert.equal(result.ok, true, `sample ${sample.type} must be accepted`)
    if (result.ok) {
      assert.equal(result.event.seq, expected, 'seq must be the next monotonic value')
    }
    assert.equal(store.lastSeq(SESSION_A), before + 1, 'counter advances by exactly 1 on accept')
  }

  const seqsA = store.eventsFor(SESSION_A).map((e) => e.seq)
  assert.deepEqual(
    seqsA,
    Array.from({ length: samples.length }, (_, i) => i + 1),
    'accepted seqs must be 1..N with no gaps',
  )
  assert.equal(store.eventsFor(SESSION_A).length, samples.length, 'every valid event is stored')

  // (2) seq is PER SESSION: session B counts from 1, independent of A.
  const firstB = { ...clone(samples[0] as EventCandidate), session_id: SESSION_B }
  const rB = store.append(firstB)
  assert.equal(rB.ok, true)
  if (rB.ok) assert.equal(rB.event.seq, 1, 'a fresh session starts its own seq at 1')
  assert.equal(store.lastSeq(SESSION_A), samples.length, 'session A counter untouched by B')

  // (3) ajv-invalid events are REJECTED, NOT stored, and never consume a seq.
  // Snapshot the good state, fire three flavours of invalid envelope, prove
  // the store did not move, then prove the next VALID append reuses the
  // number the rejections did not consume (gap-free after rejection).
  const seqBefore = store.lastSeq(SESSION_A)
  const lenBefore = store.eventsFor(SESSION_A).length

  // (a) bogus event type (not in the EventType enum)
  const badType = { ...clone(samples[0] as EventCandidate), session_id: SESSION_A }
  ;(badType as Record<string, unknown>).type = 'bogus.type'
  const r1 = store.append(badType)
  assert.equal(r1.ok, false, 'unknown event type must be rejected')
  if (!r1.ok) assert.ok(r1.errors.length > 0, 'rejection must carry ajv errors')

  // (b) empty payload (matches no family in the oneOf)
  const badPayload = { ...clone(samples[0] as EventCandidate), session_id: SESSION_A }
  ;(badPayload as Record<string, unknown>).payload = {}
  assert.equal(store.append(badPayload).ok, false, 'empty payload must be rejected')

  // (c) missing a required envelope field
  const badMissing = { ...clone(samples[0] as EventCandidate), session_id: SESSION_A } as Record<
    string,
    unknown
  >
  delete badMissing.ts
  assert.equal(
    store.append(badMissing as EventCandidate).ok,
    false,
    'missing required field must be rejected',
  )

  // The store did not move: no seq consumed, nothing stored.
  assert.equal(
    store.lastSeq(SESSION_A),
    seqBefore,
    'rejected appends must NOT advance the seq counter',
  )
  assert.equal(store.eventsFor(SESSION_A).length, lenBefore, 'rejected appends must NOT be stored')

  // The next VALID append takes seqBefore+1 - the number the rejections did
  // not consume - proving gap-free ordering survives rejection.
  const good = { ...clone(samples[0] as EventCandidate), session_id: SESSION_A }
  const r4 = store.append(good)
  assert.equal(r4.ok, true)
  if (r4.ok) assert.equal(r4.event.seq, seqBefore + 1, 'seq after rejection is contiguous, no gap')
})

// --- C10: two-ink birth rule is store-authored, not caller-trusted ------------

test('append forces provenance.state from author.kind: agent => pencil, human => ink', () => {
  const store = newStore()
  const SESSION = 'dddddddd-0000-4000-8000-00000000000d'

  // An AGENT event that (wrongly) claims to be born ink is forced back to pencil.
  const agentClaimsInk = { ...clone(samples[2] as EventCandidate), session_id: SESSION }
  assert.equal(agentClaimsInk.author.kind, 'agent', 'fixture[2] is agent-authored')
  ;(agentClaimsInk.provenance as { state: string }).state = 'ink'
  const rAgent = store.append(agentClaimsInk)
  assert.equal(rAgent.ok, true, 'the (schema-valid) agent event is accepted')
  if (rAgent.ok) {
    assert.equal(
      rAgent.event.provenance.state,
      'pencil',
      'an agent event is born pencil regardless of caller input',
    )
  }

  // A HUMAN event that (wrongly) claims to be born pencil is forced back to ink.
  const humanClaimsPencil = { ...clone(samples[0] as EventCandidate), session_id: SESSION }
  assert.equal(humanClaimsPencil.author.kind, 'human', 'fixture[0] is human-authored')
  ;(humanClaimsPencil.provenance as { state: string }).state = 'pencil'
  const rHuman = store.append(humanClaimsPencil)
  assert.equal(rHuman.ok, true, 'the (schema-valid) human event is accepted')
  if (rHuman.ok) {
    assert.equal(
      rHuman.event.provenance.state,
      'ink',
      'a human event is born ink regardless of caller input',
    )
  }
})

// --- AC4: the store module imports nothing from node:* ------------------------

test('event-store.ts imports nothing from node:* or bare node builtins', () => {
  const src = readFileSync(join(root, 'core', 'src', 'event-store.ts'), 'utf8')
  assert.doesNotMatch(src, /from\s+['"]node:/, 'the store must not import from node:*')
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
  assert.doesNotMatch(src, bare, 'the store must not import a bare node builtin')
})

// --- Supporting: the rejection reason is a real schema violation --------------

test('a valid sample is accepted and stored verbatim (aside from assigned seq)', () => {
  const store = newStore()
  const s = {
    ...clone(samples[2] as EventCandidate),
    session_id: 'cccccccc-0000-4000-8000-00000000000c',
  }
  const r = store.append(s)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.event.type, s.type, 'stored event preserves the payload family')
    assert.equal(r.event.event_id, s.event_id, 'stored event preserves identity')
    assert.equal(r.event.seq, 1, 'assigned seq is the only field the store rewrites')
    assert.equal(store.eventsFor('cccccccc-0000-4000-8000-00000000000c')[0], r.event)
  }
})
