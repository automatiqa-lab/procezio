// Re-assessment diff acceptance test (spec 01b Wave 3 G5).
//
// Named criterion: "sessionDiff reports steps added/removed/relabelled by node id, and the deltas
// in ideas, commitments, friction and cases, plus the credibility shift; identical canvases diff
// to all zeros." Pure diff of two projected canvases.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionDiff } from './session-diff.js'
import type { Canvas } from '@procezio/schema'

const make = (over: Record<string, unknown>): Canvas =>
  ({
    schema_version: '1.2',
    process: { name: 'p' },
    lanes: [],
    zones: [],
    nodes: [],
    edges: [],
    ...over,
  }) as unknown as Canvas

test('sessionDiff reports added, removed and relabelled steps by id', () => {
  const prior = make({
    nodes: [
      { id: 'n1', type: 'Step', lane: 'a', label: 'old', zone: 2 },
      { id: 'n2', type: 'Step', lane: 'a', label: 'gone', zone: 2 },
    ],
  })
  const current = make({
    nodes: [
      { id: 'n1', type: 'Step', lane: 'a', label: 'renamed', zone: 2 }, // relabel
      { id: 'n3', type: 'Step', lane: 'a', label: 'new', zone: 2 }, // added
    ],
  })
  const d = sessionDiff(prior, current)
  assert.equal(d.nodesAdded, 1)
  assert.equal(d.nodesRemoved, 1)
  assert.equal(d.nodesRelabeled, 1)
})

test('sessionDiff reports idea, commitment, friction and case deltas', () => {
  const prior = make({ opportunities: [{ id: 'o1', title: 'a' }] })
  const current = make({
    opportunities: [
      { id: 'o1', title: 'a', committed: true, score: { benefit: 4, effort: 2 } },
      { id: 'o2', title: 'b' },
    ],
    friction: [{ id: 'f1', node_id: 'n1', waste: 'Waiting' }],
    cases: [{ opportunity_id: 'o1', figures: [], assumptions: [] }],
  })
  const d = sessionDiff(prior, current)
  assert.equal(d.ideasAdded, 1)
  assert.equal(d.committedDelta, 1)
  assert.equal(d.frictionDelta, 1)
  assert.equal(d.casesDelta, 1)
})

test('identical canvases diff to all zeros', () => {
  const c = make({ nodes: [{ id: 'n1', type: 'Step', lane: 'a', label: 'x', zone: 2 }] })
  const d = sessionDiff(c, c)
  assert.deepEqual(
    [
      d.nodesAdded,
      d.nodesRemoved,
      d.nodesRelabeled,
      d.ideasAdded,
      d.committedDelta,
      d.frictionDelta,
      d.casesDelta,
    ],
    [0, 0, 0, 0, 0, 0, 0],
  )
  assert.equal(d.credibilityFrom, d.credibilityTo)
})
