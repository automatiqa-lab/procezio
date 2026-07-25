// M2-07 acceptance test - the event-building helper of the Zone 4 (Data & Rules) surface.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "buildAuditTagSetCandidate builds a valid audit_tag.set event that, dispatched
//    through the M2-01 store, appears in getCanvas().audit_tags with the correct
//    node_id and the three-axis profile; re-setting the same step edits in place
//    (upsert by id) rather than stacking a second tag"
//
// This proves the whole event -> (precompiled ajv validation) -> C9 projection ->
// what the view renders, at the layer a Node gate CAN prove. Rendering itself (empty
// state, segmented pickers, zero console errors under strict CSP) is proved
// separately by the screenshot-verified criterion, since a headless Node test cannot
// observe a browser.
//
// It imports ONLY pure modules (data/events.ts, map/events.ts, canvas-store.ts,
// session.ts, @procezio/core, @procezio/schema types) - never a .tsx or React - so it
// runs headless with no React/DOM, exactly like friction/friction.test.ts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AXIS_HELP,
  DATA_TAGS,
  EXCEPTIONS_TAGS,
  RULES_TAGS,
  buildAuditTagSetCandidate,
} from './events.js'
import { buildNodeCreatedCandidate } from '../map/events.js'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import type { AuditTag, DataTag, ExceptionsTag, Node, RulesTag } from '@procezio/schema'

// A fixed, schema-valid session id (Uuid format). Reused as session_id +
// correlation_id on every candidate so all events land in one session's log.
const SESSION_ID = '5f3e9b2a-1c4d-4e6f-8a1b-2c3d4e5f6072'

/** Deterministic UUID-format event_id provider (decimal digits are valid hex). */
function makeIdProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  }
}

/** Deterministic RFC3339 date-time provider (minute counter). */
function makeTsProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `2026-07-08T09:${String(n).padStart(2, '0')}:00Z`
  }
}

/** A store with a live session and one real node to profile. */
function openStoreWithNode(nodeId: string): ReturnType<typeof createCanvasStore> {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: makeTsProvider(),
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Procure-to-Pay'))
  const node: Node = {
    id: nodeId,
    type: 'Step',
    lane: 'requester',
    label: 'Raise requisition',
    zone: 2,
  }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, node))
  return store
}

// --- The named acceptance test ------------------------------------------------

test('buildAuditTagSetCandidate builds a valid audit_tag.set event that, dispatched through the M2-01 store, appears in getCanvas().audit_tags with the correct node_id and the three-axis profile; re-setting the same step edits in place (upsert by id)', () => {
  const NODE_ID = 'n-raise-req'
  const store = openStoreWithNode(NODE_ID)
  assert.equal(
    (getCanvas(store.getState()).audit_tags ?? []).length,
    0,
    'no profile before the axes are set',
  )

  // The view mints the tag id at the app edge; here we supply a fixed id so the
  // test is deterministic.
  const tag: AuditTag = {
    id: 'a-raise-req',
    node_id: NODE_ID,
    data: 'structured',
    rules: 'explicit',
    exceptions: 'rare',
  }
  store.getState().dispatch(buildAuditTagSetCandidate(SESSION_ID, tag))

  let tags = getCanvas(store.getState()).audit_tags ?? []
  assert.equal(tags.length, 1, 'exactly one profile is set on the step')
  assert.equal(tags[0]?.node_id, NODE_ID, 'the profile carries the correct node_id')
  assert.equal(tags[0]?.data, 'structured', 'data axis is carried through')
  assert.equal(tags[0]?.rules, 'explicit', 'rules axis is carried through')
  assert.equal(tags[0]?.exceptions, 'rare', 'exceptions axis is carried through')
  assert.equal(getError(store.getState()), null, 'a valid audit_tag.set leaves lastError null')

  // Re-set the SAME step's profile (same id): C9 upserts by id, so it edits in
  // place - one tag, updated values, never a second tag stacked on the node.
  const edited: AuditTag = {
    id: 'a-raise-req',
    node_id: NODE_ID,
    data: 'unstructured',
    rules: 'judgment',
    exceptions: 'frequent',
  }
  store.getState().dispatch(buildAuditTagSetCandidate(SESSION_ID, edited))

  tags = getCanvas(store.getState()).audit_tags ?? []
  assert.equal(tags.length, 1, 're-setting the same step edits in place (no duplicate tag)')
  assert.equal(tags[0]?.data, 'unstructured', 'the edited data axis replaces the old value')
  assert.equal(tags[0]?.rules, 'judgment', 'the edited rules axis replaces the old value')
  assert.equal(tags[0]?.exceptions, 'frequent', 'the edited exceptions axis replaces the old value')
  assert.equal(getError(store.getState()), null, 'the edit leaves lastError null')
})

// --- Two steps each get their own profile (grouped by node_id) ----------------

test('two steps each hold their own profile; audit_tags groups by node_id', () => {
  const store = openStoreWithNode('n-a')
  const nodeB: Node = { id: 'n-b', type: 'Step', lane: 'requester', label: 'Approve', zone: 2 }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, nodeB))

  store.getState().dispatch(
    buildAuditTagSetCandidate(SESSION_ID, {
      id: 'a-a',
      node_id: 'n-a',
      data: 'structured',
      rules: 'explicit',
      exceptions: 'rare',
    }),
  )
  store.getState().dispatch(
    buildAuditTagSetCandidate(SESSION_ID, {
      id: 'a-b',
      node_id: 'n-b',
      data: 'unstructured',
      rules: 'judgment',
      exceptions: 'occasional',
    }),
  )

  const tags = getCanvas(store.getState()).audit_tags ?? []
  assert.equal(tags.length, 2, 'each step holds its own profile')
  assert.equal(
    tags.find((t) => t.node_id === 'n-a')?.rules,
    'explicit',
    'step A keeps its own rules axis',
  )
  assert.equal(
    tags.find((t) => t.node_id === 'n-b')?.rules,
    'judgment',
    'step B keeps its own rules axis',
  )
  assert.equal(getError(store.getState()), null, 'both valid profiles leave lastError null')
})

// --- The option lists are exactly the schema's three-per-axis unions ----------

test('the axis option lists match the schema unions and every combination is store-acceptable', () => {
  assert.deepEqual([...DATA_TAGS], ['structured', 'semi-structured', 'unstructured'])
  assert.deepEqual([...RULES_TAGS], ['explicit', 'mixed', 'judgment'])
  assert.deepEqual([...EXCEPTIONS_TAGS], ['rare', 'occasional', 'frequent'])

  // Every axis option carries a plain-language gloss (no jargon-only labels).
  DATA_TAGS.forEach((d: DataTag) => assert.ok(AXIS_HELP.data[d]?.length, `data help for ${d}`))
  RULES_TAGS.forEach((r: RulesTag) => assert.ok(AXIS_HELP.rules[r]?.length, `rules help for ${r}`))
  EXCEPTIONS_TAGS.forEach((e: ExceptionsTag) =>
    assert.ok(AXIS_HELP.exceptions[e]?.length, `exceptions help for ${e}`),
  )

  const store = openStoreWithNode('n-x')
  let i = 0
  for (const data of DATA_TAGS) {
    for (const rules of RULES_TAGS) {
      for (const exceptions of EXCEPTIONS_TAGS) {
        i += 1
        // Same node id each time: upsert keeps a single tag, so we assert the store
        // accepts every one of the 27 combinations (lastError stays null).
        store.getState().dispatch(
          buildAuditTagSetCandidate(SESSION_ID, {
            id: 'a-x',
            node_id: 'n-x',
            data,
            rules,
            exceptions,
          }),
        )
        assert.equal(
          getError(store.getState()),
          null,
          `combination ${i} (${data}/${rules}/${exceptions}) is accepted`,
        )
      }
    }
  }
  assert.equal(i, 27, 'all 3x3x3 axis combinations were exercised')
  assert.equal(
    (getCanvas(store.getState()).audit_tags ?? []).length,
    1,
    'upsert by id keeps a single tag on the node',
  )
})
