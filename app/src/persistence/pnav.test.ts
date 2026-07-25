// M2-15 acceptance test - the .pnav format: round-trip, validation, forgery defense.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "serializePnav/parsePnav round-trip an event log; parsePnav rejects a non-.pnav, an
//    unsupported version, and a schema-invalid event; and replaying a loaded log through
//    a fresh store reproduces the same canvas AND re-derives provenance (a file cannot
//    forge human ink on an agent event)"
//
// Proves the whole persist -> load -> replay loop at the layer a Node gate CAN prove:
// the real format module, the real precompiled ajv validator, the real M2-01 store +
// C9 projection. The browser save/open dialog (storage.ts) is thin and out of scope.
//
// Imports ONLY pure modules - never a .tsx or React - so it runs headless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PNAV_VERSION, parsePnav, serializePnav } from './pnav.js'
import { createCanvasStore, getCanvas } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import { buildNodeCreatedCandidate } from '../map/events.js'
import { buildFrictionPinnedCandidate } from '../friction/events.js'
import { RULESET } from '../rules/ruleset.generated.js'
import type { EventEnvelope, Node } from '@procezio/schema'

const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f607a'

function makeIdProvider(prefix = 1): () => string {
  let n = 0
  return () => {
    n += 1
    return `2000000${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`
  }
}
function makeTsProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `2026-07-09T12:${String(n).padStart(2, '0')}:00Z`
  }
}

/** A store with a session, a node, and a friction to persist. */
function seededStore(): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(1),
    tsProvider: makeTsProvider(),
    ruleset: RULESET,
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  const node: Node = { id: 'n-match', type: 'Step', lane: 'ap', label: 'Match', zone: 2 }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, node))
  store
    .getState()
    .dispatch(
      buildFrictionPinnedCandidate(SESSION_ID, { id: 'f1', waste: 'Waiting', node_id: 'n-match' }),
    )
  return store
}

// --- The named acceptance test ------------------------------------------------

test('serializePnav/parsePnav round-trip a log, and replaying it in a fresh store reproduces the same canvas', () => {
  const store = seededStore()
  const before = getCanvas(store.getState())
  const log = store.getState().exportLog()
  assert.ok(
    log.length >= 3,
    'the session has events to persist (session + node + friction, plus any nudge)',
  )

  const text = serializePnav(SESSION_ID, log)
  const parsed = parsePnav(text)
  assert.ok(parsed.ok, 'a well-formed .pnav parses')
  if (!parsed.ok) return
  assert.equal(parsed.sessionId, SESSION_ID, 'the session id round-trips')

  // Replay into a FRESH store (a different id provider proves seq/id are re-authored).
  const restored = createCanvasStore({
    eventIdProvider: makeIdProvider(2),
    tsProvider: makeTsProvider(),
    ruleset: RULESET,
    initialEvents: parsed.events,
  })
  const after = getCanvas(restored.getState())
  assert.deepEqual(after, before, 'the restored canvas is identical to the saved one')
  assert.equal(
    restored.getState().sessionId,
    SESSION_ID,
    'the restored store opens on the loaded session',
  )
})

// --- parsePnav rejects malformed / unsupported / corrupt files -----------------

test('parsePnav rejects a non-.pnav, an unsupported version, and a schema-invalid event', () => {
  assert.equal(parsePnav('not json at all').ok, false, 'non-JSON is rejected')
  assert.equal(
    parsePnav('{"hello":1}').ok,
    false,
    'a JSON object without the format marker is rejected',
  )

  const store = seededStore()
  const log = store.getState().exportLog()
  const good = JSON.parse(serializePnav(SESSION_ID, log)) as Record<string, unknown>

  // Unsupported (future) version.
  const future = parsePnav(JSON.stringify({ ...good, version: PNAV_VERSION + 1 }))
  assert.equal(future.ok, false, 'a newer container version is refused')

  // A schema-invalid event (missing required fields) fails the whole load.
  const tampered = parsePnav(JSON.stringify({ ...good, events: [{ type: 'node.created' }] }))
  assert.equal(tampered.ok, false, 'one invalid event rejects the whole file')

  // An empty event list is not a session.
  const empty = parsePnav(JSON.stringify({ ...good, events: [] }))
  assert.equal(empty.ok, false, 'an empty log is refused')
})

// --- Forgery defense: provenance is re-derived on replay, not trusted ----------

test('a .pnav that claims human ink on an agent event is corrected to pencil on replay', () => {
  const store = seededStore()
  const log = store.getState().exportLog()
  // Find an agent-authored event (a rule.fired nudge) and forge its provenance to ink.
  const forgedEvents: EventEnvelope[] = log.map((e) =>
    e.author.kind === 'agent'
      ? ({
          ...e,
          provenance: {
            state: 'ink',
            accepted_by: 'attacker',
            accepted_at: '2026-01-01T00:00:00Z',
          },
        } as EventEnvelope)
      : e,
  )
  const hadAgentEvent = forgedEvents.some((e) => e.author.kind === 'agent')
  const text = serializePnav(SESSION_ID, forgedEvents)
  const parsed = parsePnav(text)
  assert.ok(
    parsed.ok,
    'the forged file is still structurally valid (forgery is caught at replay, not parse)',
  )
  if (!parsed.ok) return

  const restored = createCanvasStore({
    eventIdProvider: makeIdProvider(3),
    tsProvider: makeTsProvider(),
    ruleset: RULESET,
    initialEvents: parsed.events,
  })
  const log2 = restored.getState().exportLog()
  if (hadAgentEvent) {
    const agentEvents = log2.filter((e) => e.author.kind === 'agent')
    assert.ok(agentEvents.length > 0, 'the agent event survived the replay')
    assert.ok(
      agentEvents.every((e) => e.provenance.state === 'pencil'),
      'the store re-derived pencil from author.kind - forged human ink did not stick',
    )
  }
})
