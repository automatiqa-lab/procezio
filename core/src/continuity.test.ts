// Continuity-check acceptance test (spec 01b Wave 3 B9): deterministic contradictions.
//
// Named criterion: "continuityChecks flags a dangling friction/tag/target reference, a committed
// idea with no score, a figure citing a missing source, and a systems-vs-unstructured mismatch; a
// consistent canvas yields nothing." No LLM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { continuityChecks } from './continuity.js'
import type { Canvas } from '@procezio/schema'

const base = (over: Record<string, unknown>): Canvas =>
  ({
    schema_version: '1.2',
    process: { name: 'p' },
    lanes: [],
    zones: [],
    nodes: [{ id: 'n1', type: 'Step', lane: 'a', label: 'match', zone: 2 }],
    edges: [],
    ...over,
  }) as unknown as Canvas

test('a dangling friction reference is flagged', () => {
  const flags = continuityChecks(
    base({ friction: [{ id: 'f1', node_id: 'ghost', waste: 'Waiting' }] }),
  )
  assert.ok(flags.some((f) => /not on the map/i.test(f.message)))
})

test('a committed idea with no score is flagged', () => {
  const flags = continuityChecks(
    base({ opportunities: [{ id: 'o1', title: 'auto', committed: true }] }),
  )
  assert.ok(flags.some((f) => /no score/i.test(f.message)))
})

test('a figure citing a missing source is flagged', () => {
  const flags = continuityChecks(
    base({
      cases: [{ opportunity_id: 'o1', figures: [{ label: 'x', value: '1', source_ref: 'ghost' }] }],
    }),
  )
  assert.ok(flags.some((f) => /not on the canvas/i.test(f.message)))
})

test('a systems step tagged unstructured is flagged as a likely mismatch', () => {
  const flags = continuityChecks(
    base({
      nodes: [
        {
          id: 'n1',
          type: 'Step',
          lane: 'a',
          label: 'enter',
          zone: 2,
          step_detail: { systems: ['ERP'] },
        },
      ],
      audit_tags: [
        { id: 'a1', node_id: 'n1', data: 'unstructured', rules: 'explicit', exceptions: 'rare' },
      ],
    }),
  )
  assert.ok(flags.some((f) => /likely wrong/i.test(f.message)))
})

test('a consistent canvas yields no continuity flags', () => {
  const flags = continuityChecks(
    base({
      friction: [{ id: 'f1', node_id: 'n1', waste: 'Waiting' }],
      opportunities: [
        { id: 'o1', title: 'auto', committed: true, score: { benefit: 4, effort: 2 } },
      ],
    }),
  )
  assert.deepEqual(flags, [])
})
