// Token-simulation route acceptance test (spec 01b Wave 2 F2).
//
// Named criterion: "flowRoute walks forward sequence edges from a Start node, never revisits (so a
// rework loop terminates), skips back-edges, and returns [] for an empty map." Pure, deterministic.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flowRoute } from './tokenRoute.js'
import type { Canvas } from '@procezio/schema'

const canvas = (nodes: unknown[], edges: unknown[]): Canvas =>
  ({
    schema_version: '1.2',
    process: { name: 'p' },
    lanes: [],
    zones: [],
    nodes,
    edges,
  }) as unknown as Canvas

test('flowRoute walks Start -> ... -> End in order', () => {
  const c = canvas(
    [
      { id: 's', type: 'Start', lane: 'a', label: 's', zone: 2 },
      { id: 'm', type: 'Step', lane: 'a', label: 'm', zone: 2 },
      { id: 'e', type: 'End', lane: 'a', label: 'e', zone: 2 },
    ],
    [
      { id: 'e1', from: 's', to: 'm', kind: 'sequence' },
      { id: 'e2', from: 'm', to: 'e', kind: 'sequence' },
    ],
  )
  assert.deepEqual(flowRoute(c), ['s', 'm', 'e'])
})

test('a rework back-edge does not loop the route forever', () => {
  const c = canvas(
    [
      { id: 's', type: 'Start', lane: 'a', label: 's', zone: 2 },
      { id: 'm', type: 'Step', lane: 'a', label: 'm', zone: 2 },
      { id: 'd', type: 'Decision', lane: 'a', label: 'd', zone: 2 },
    ],
    [
      { id: 'e1', from: 's', to: 'm', kind: 'sequence' },
      { id: 'e2', from: 'm', to: 'd', kind: 'sequence' },
      { id: 'e3', from: 'd', to: 'm', kind: 'exception-backedge' }, // rework loop
    ],
  )
  const route = flowRoute(c)
  assert.deepEqual(route, ['s', 'm', 'd'], 'the back-edge is skipped and no node repeats')
})

test('flowRoute starts at the first node when there is no Start, and [] for an empty map', () => {
  const c = canvas(
    [
      { id: 'a', type: 'Step', lane: 'l', label: 'a', zone: 2 },
      { id: 'b', type: 'Step', lane: 'l', label: 'b', zone: 2 },
    ],
    [{ id: 'e1', from: 'a', to: 'b', kind: 'sequence' }],
  )
  assert.deepEqual(flowRoute(c), ['a', 'b'])
  assert.deepEqual(flowRoute(canvas([], [])), [])
})
