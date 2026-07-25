// Board-review acceptance test (spec 01b Wave 2 E6): deterministic inconsistency flags.
//
// Named criterion: "boardReviewFlags catches an unsourced figure, a capacity-release benefit with
// no redeployment owner, and a one-sided case; a consistent case yields no flags." No LLM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boardReviewFlags } from './board-review.js'
import type { Canvas } from '@procezio/schema'

const withCase = (figures: unknown[]): Canvas =>
  ({
    schema_version: '1.2',
    process: { name: 'p' },
    lanes: [],
    zones: [],
    nodes: [],
    edges: [],
    cases: [{ opportunity_id: 'o1', figures, assumptions: [] }],
  }) as unknown as Canvas

test('flags an unsourced figure', () => {
  const flags = boardReviewFlags(
    withCase([
      { label: 'cost', value: '1', source_ref: 'n1', kind: 'cost' },
      { label: 'benefit', value: '2', source_ref: '', kind: 'benefit' },
    ]),
  )
  assert.ok(flags.some((f) => /no source/i.test(f.message)))
})

test('flags a capacity-release benefit with no redeployment owner', () => {
  const flags = boardReviewFlags(
    withCase([
      { label: 'cost', value: '1', source_ref: 'n1', kind: 'cost' },
      {
        label: 'freed hours',
        value: '10h',
        source_ref: 'n2',
        kind: 'benefit',
        benefit_class: 'capacity-release',
      },
    ]),
  )
  assert.ok(flags.some((f) => /redeployment owner/i.test(f.message)))
})

test('flags a one-sided case (only benefits)', () => {
  const flags = boardReviewFlags(
    withCase([{ label: 'b', value: '2', source_ref: 'n1', kind: 'benefit' }]),
  )
  assert.ok(flags.some((f) => /only benefits/i.test(f.message)))
})

test('a consistent, two-sided, sourced case yields no flags', () => {
  const flags = boardReviewFlags(
    withCase([
      { label: 'cost', value: '1', source_ref: 'n1', kind: 'cost' },
      {
        label: 'savings',
        value: '2',
        source_ref: 'n2',
        kind: 'benefit',
        benefit_class: 'hard-savings',
      },
    ]),
  )
  assert.deepEqual(flags, [])
})

test('untagged figures are flagged as unweighable, not falsely "only benefits" (review #3)', () => {
  const flags = boardReviewFlags(
    withCase([{ label: 'x', value: '1', source_ref: 'n1' }]), // no kind
  )
  assert.ok(flags.some((f) => /cannot weigh/i.test(f.message)))
  assert.ok(!flags.some((f) => /only benefits/i.test(f.message)), 'no false one-sided claim')
})
