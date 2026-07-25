// M2-02 acceptance test.
//
// Named criterion (CardContract, ImplPlan.testName):
//   "mounting behavior produces a canvas with sessionId + process.name set after
//    dispatching the app-boundary session.started candidate through the real
//    createCanvasStore"
//
// This drives the REAL @procezio/core event store + the M2-01 store against the
// SAME ratified schema the core's own tests use (schema/canvas.schema.json). It
// proves the acceptance criterion "a session.started event is dispatched through the
// M2-01 store on app mount" as a direct, deterministic property - no DOM/React
// render environment (this repo deliberately ships no jsdom/RTL). App.tsx's mount effect
// is a two-line wrapper: mint a session id at the edge, then dispatch exactly the
// candidate buildSessionStartedCandidate() produces through exactly this store; that
// is what this test exercises.
//
// Resolution: node --test runs from the repo root, so the schema is read via
// process.cwd(), independent of where this test compiles to (app/dist/session.test.js
// under the tsc build:node step). session.ts itself touches no node:*, no clock, no
// RNG - THIS test file may, and uses node:fs only to load the ratified schema and to
// statically scan session.ts for forbidden id/time generation.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvasStore, getError } from './store/canvas-store.js'
import { buildSessionStartedCandidate } from './session.js'

const root = process.cwd()

// A fixed, valid UUID standing in for the id App.tsx mints with crypto.randomUUID()
// at the app boundary. Passing it in (rather than generating inside the store or the
// builder) is the whole point: id generation lives at the edge, the store stays pure.
const FIXED_SESSION_ID = '11111111-2222-4333-8444-555555555555'
const PROCESS_NAME = 'Procure-to-Pay'

// Deterministic injected providers - the store never mints ids/ts itself.
function makeIdProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  }
}
function makeTsProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `2026-07-06T10:${String(n).padStart(2, '0')}:00Z`
  }
}

// --- The named acceptance test ------------------------------------------------

test('mounting behavior produces a canvas with sessionId + process.name set after dispatching the app-boundary session.started candidate through the real createCanvasStore', () => {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })

  // Precondition: nothing dispatched yet.
  assert.equal(store.getState().sessionId, null, 'no session before mount')

  // Reproduce App.tsx's mount effect exactly: mint the id at the edge (here a fixed
  // value in place of crypto.randomUUID), build the candidate, dispatch it through
  // the real store.
  store.getState().dispatch(buildSessionStartedCandidate(FIXED_SESSION_ID, PROCESS_NAME))

  // The candidate was ACCEPTED by the real core ajv validation (no error), the store
  // adopted the app-minted session id, and the projection carries the process name.
  assert.equal(getError(store.getState()), null, 'session.started must pass core validation')
  assert.equal(
    store.getState().sessionId,
    FIXED_SESSION_ID,
    'store adopts the app-boundary session id',
  )
  assert.equal(
    store.getState().canvas.process.name,
    PROCESS_NAME,
    'session.started projects the process name onto the canvas',
  )
})

// --- The builder is pure: no id/clock/RNG generation of its own ---------------

test('buildSessionStartedCandidate is a pure function of its inputs (no minted id/ts)', () => {
  const a = buildSessionStartedCandidate(FIXED_SESSION_ID, PROCESS_NAME)
  const b = buildSessionStartedCandidate(FIXED_SESSION_ID, PROCESS_NAME)
  // Same inputs => byte-identical candidate; correlation_id echoes the session id;
  // event_id and ts are ABSENT (the store resolves them from injected providers).
  assert.deepEqual(a, b, 'same inputs must yield an identical candidate')
  assert.equal(a.session_id, FIXED_SESSION_ID)
  assert.equal(a.correlation_id, FIXED_SESSION_ID)
  assert.equal(a.type, 'session.started')
  assert.equal((a as Record<string, unknown>).event_id, undefined, 'builder mints no event_id')
  assert.equal((a as Record<string, unknown>).ts, undefined, 'builder mints no ts')

  // Scan the CODE, not the prose: strip block and line comments first so the
  // doc-comment (which legitimately explains that App.tsx mints ids) is not matched.
  const src = readFileSync(join(root, 'app', 'src', 'session.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.doesNotMatch(code, /randomUUID/, 'the builder must not mint ids')
  assert.doesNotMatch(code, /Date\.now\(|new Date\(/, 'the builder must not read the clock')
  assert.doesNotMatch(code, /Math\.random\(/, 'the builder must not use randomness')
  assert.doesNotMatch(code, /from\s+['"]node:/, 'the builder must not import from node:*')
})

// --- The static zone/phase structure is the fixed 8/3 shape (spec v0.2 s.6) ---

test('zones.ts encodes the fixed 8 zones in 3 phases with the Understand/Diverge/Converge split', async () => {
  const { ZONES, PHASES, PHASE_ORDER } = await import('./zones.js')

  assert.equal(ZONES.length, 8, 'exactly 8 zones')
  assert.deepEqual(
    ZONES.map((z) => z.id),
    [1, 2, 3, 4, 5, 6, 7, 8],
    'zone ids are 1..8 in order',
  )
  assert.deepEqual([...PHASE_ORDER], ['Understand', 'Diverge', 'Converge'], 'three phases in order')

  // The fixed phase grouping: UNDERSTAND 1-4, DIVERGE 5, CONVERGE 6-8.
  const idsByPhase = Object.fromEntries(PHASES.map((g) => [g.phase, g.zones.map((z) => z.id)]))
  assert.deepEqual(idsByPhase.Understand, [1, 2, 3, 4], 'Understand groups zones 1-4')
  assert.deepEqual(idsByPhase.Diverge, [5], 'Diverge groups zone 5')
  assert.deepEqual(idsByPhase.Converge, [6, 7, 8], 'Converge groups zones 6-8')

  // Every zone carries a name and a one-line purpose for its panel/rail label.
  for (const zone of ZONES) {
    assert.ok(zone.name.length > 0, `zone ${zone.id} has a name`)
    assert.ok(zone.purpose.length > 0, `zone ${zone.id} has a purpose`)
  }
})
