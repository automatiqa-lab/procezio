// Recalculating GPS agent acceptance test (spec 01b section 2, A3).
//
// Named criterion: "recalcRoute returns a soft-reroute message naming the earliest unfinished zone
// before the target, and null when everything earlier is complete or the target is zone 1; it never
// blocks - it only returns a string to show." Pure, deterministic (reads zoneCompleteness).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recalcRoute } from './recalc.js'
import type { Canvas } from '@procezio/schema'

// A canvas with no Frame details and no map: zones 1-2 have gaps.
const bare = {
  schema_version: '1.2',
  process: {},
  lanes: [],
  zones: [],
  nodes: [],
  edges: [],
} as unknown as Canvas

test('jumping to a late zone with an unfinished earlier zone recalculates', () => {
  const msg = recalcRoute(bare, 8)
  assert.ok(msg !== null, 'a reroute is offered')
  assert.match(msg!, /Recalculating/i)
  assert.match(msg!, /Frame/, 'it points at the earliest unfinished zone (Frame)')
  assert.match(msg!, /won't block/i, 'and is explicit that it does not block')
})

test('jumping to zone 1 never recalculates', () => {
  assert.equal(recalcRoute(bare, 1), null)
})

test('a fully-framed early run does not recalculate a small forward step', () => {
  // Frame fully filled + a Start/Step/End map: zones 1-2 read complete, so a jump to 3 is clean.
  const canvas = {
    schema_version: '1.2',
    process: {
      name: 'P',
      trigger: 't',
      end_state: 'e',
      owner: 'o',
      frequency: 'f',
      volume: 'v',
      north_star: 'n',
    },
    lanes: [{ id: 'a', actor: 'A' }],
    zones: [],
    nodes: [
      { id: 's', type: 'Start', lane: 'a', label: 's', zone: 2 },
      { id: 'm', type: 'Step', lane: 'a', label: 'm', zone: 2 },
      { id: 'e', type: 'End', lane: 'a', label: 'e', zone: 2 },
    ],
    edges: [
      { id: 'e1', from: 's', to: 'm', kind: 'sequence' },
      { id: 'e2', from: 'm', to: 'e', kind: 'sequence' },
    ],
  } as unknown as Canvas
  assert.equal(recalcRoute(canvas, 3), null, 'clean forward progress is silent')
})
