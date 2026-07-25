// M2-01 acceptance test.
//
// Named criterion (CardContract, ImplPlan.testName):
//   'Dispatching session.started then valid node.created results in node
//    appearing in store.getCanvas().nodes'
//
// The store is a pure, deterministic mirror of the core event log. This test
// proves that against the SAME ratified contract and fixture corpus the core's
// own tests use: schema/canvas.schema.json and the 15-family valid corpus in
// schema/fixtures/event-envelope.samples.json. It never invents sample events.
//
// Resolution: node --test runs from the repo root, so schema + source files are
// read via process.cwd(), independent of where this test compiles to (app/dist
// under the tsc build:node step). The store module itself may not touch node:* -
// THIS test file may, and uses node:fs only to (a) load the fixtures and (b)
// statically scan the store source for forbidden Date.now/Math.random/node:*.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvasStore, getCanvas, getError } from './canvas-store.js'
import type { DispatchCandidate } from './canvas-store.js'
import type { EventCandidate } from '@procezio/core'

const root = process.cwd()
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(root, rel), 'utf8'))

const samples = readJson('schema/fixtures/event-envelope.samples.json') as EventCandidate[]

const clone = <T>(o: T): T => structuredClone(o)

// Fixture indices (asserted below so the test fails loudly if the corpus order
// ever changes) - session.started is the first family, node.created the third.
const SESSION_STARTED = 0
const NODE_CREATED = 2
// The node id carried by the node.created fixture's payload.
const FIXTURE_NODE_ID = 'n-raise-req'

/**
 * Strip event_id and ts from a fixture so dispatch must resolve them from the
 * INJECTED providers - the path the acceptance criterion exercises. seq is left
 * on the object and is harmlessly overwritten by the core store, exactly as in
 * event-store.test.ts.
 */
function withoutIds(sample: EventCandidate): DispatchCandidate {
  const copy = clone(sample) as Record<string, unknown>
  delete copy.event_id
  delete copy.ts
  return copy as unknown as DispatchCandidate
}

/** Deterministic UUID-format id provider (decimal digits are valid hex). */
function makeIdProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  }
}

/** Deterministic RFC3339 date-time provider (minute counter). */
function makeTsProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `2026-07-06T10:${String(n).padStart(2, '0')}:00Z`
  }
}

// Guard: this whole file leans on the two fixtures being the families we expect.
test('fixture corpus has session.started at [0] and node.created at [2]', () => {
  assert.equal(samples[SESSION_STARTED]?.type, 'session.started')
  assert.equal(samples[NODE_CREATED]?.type, 'node.created')
})

// --- The named acceptance test ------------------------------------------------

test('Dispatching session.started then valid node.created results in node appearing in store.getCanvas().nodes', () => {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })

  // Empty projection before any dispatch: no nodes, no error.
  assert.equal(getCanvas(store.getState()).nodes.length, 0, 'canvas starts empty')
  assert.equal(getError(store.getState()), null, 'no error before dispatch')

  // (1) session.started, then (2) a valid node.created - both from the ratified
  // fixtures, ids/ts supplied by the injected providers (NOT by the store).
  store.getState().dispatch(withoutIds(samples[SESSION_STARTED] as EventCandidate))
  store.getState().dispatch(withoutIds(samples[NODE_CREATED] as EventCandidate))

  // The created node appears in the projected canvas, and no error was set.
  const canvas = getCanvas(store.getState())
  assert.ok(
    canvas.nodes.some((n) => n.id === FIXTURE_NODE_ID),
    'the created node must appear in getCanvas().nodes',
  )
  assert.equal(getError(store.getState()), null, 'a valid sequence leaves lastError null')
  // session id was adopted from the accepted events.
  assert.equal(
    store.getState().sessionId,
    (samples[SESSION_STARTED] as EventCandidate).session_id,
    'store adopts the dispatched session id',
  )
})

// --- A schema-invalid dispatch leaves the canvas unchanged, populates error ---

test('a schema-invalid EventCandidate leaves canvas unchanged and populates lastError', () => {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })

  // Establish a real canvas first.
  store.getState().dispatch(withoutIds(samples[SESSION_STARTED] as EventCandidate))
  store.getState().dispatch(withoutIds(samples[NODE_CREATED] as EventCandidate))
  const canvasBefore = getCanvas(store.getState())
  const sessionBefore = store.getState().sessionId

  // A bogus event type matches no family in the schema's oneOf - the same
  // mutation event-store.test.ts uses to force an ajv rejection.
  const bad = withoutIds(samples[NODE_CREATED] as EventCandidate)
  ;(bad as Record<string, unknown>).type = 'bogus.type'
  store.getState().dispatch(bad)

  const err = getError(store.getState())
  assert.notEqual(err, null, 'rejection must populate lastError')
  assert.ok(err !== null && err.length > 0, 'lastError must carry ajv errors')
  // Canvas and session id are untouched by the rejected dispatch.
  assert.deepEqual(
    getCanvas(store.getState()),
    canvasBefore,
    'canvas must be unchanged on rejection',
  )
  assert.equal(
    store.getState().sessionId,
    sessionBefore,
    'session id must be unchanged on rejection',
  )
})

// --- Determinism: identical injected sequences => identical canvases ----------

test('two identical dispatch sequences (same injected ids/ts) produce identical canvas state', () => {
  const build = (): unknown => {
    const store = createCanvasStore({
      eventIdProvider: makeIdProvider(),
      tsProvider: makeTsProvider(),
    })
    store.getState().dispatch(withoutIds(samples[SESSION_STARTED] as EventCandidate))
    store.getState().dispatch(withoutIds(samples[NODE_CREATED] as EventCandidate))
    return getCanvas(store.getState())
  }
  assert.deepEqual(build(), build(), 'same events + same injected ids/ts => byte-identical canvas')
})

// --- Caller-supplied ids: dispatch works with NO providers configured ---------

test('dispatch uses the candidate own event_id/ts when no providers are configured', () => {
  const store = createCanvasStore()
  // The full fixture carries its own event_id + ts, so no provider is needed.
  store.getState().dispatch(clone(samples[SESSION_STARTED] as EventCandidate) as DispatchCandidate)
  assert.equal(getError(store.getState()), null, 'caller-supplied ids accepted without providers')
  assert.equal(
    getCanvas(store.getState()).process.name,
    'Procure-to-Pay, indirect goods',
    'session.started projected the process name',
  )
})

// --- Fail-loud: dispatch throws when neither candidate nor provider gives an id -

test('dispatch throws (never silently fabricates) when event_id is absent and no provider is set', () => {
  const store = createCanvasStore()
  assert.throws(
    () => store.getState().dispatch(withoutIds(samples[SESSION_STARTED] as EventCandidate)),
    /event_id/,
    'missing id with no provider must throw, not fabricate',
  )
})

// --- Source scan: the store core generates no ids/time and imports no node:* ---

test('canvas-store.ts contains no Date.now/Math.random and imports nothing from node:*', () => {
  const src = readFileSync(join(root, 'app', 'src', 'store', 'canvas-store.ts'), 'utf8')
  assert.doesNotMatch(src, /Date\.now\(/, 'the store must not read the wall clock')
  assert.doesNotMatch(src, /Math\.random\(/, 'the store must not use randomness')
  assert.doesNotMatch(src, /from\s+['"]node:/, 'the store must not import from node:*')
})
