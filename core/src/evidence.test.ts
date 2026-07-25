// Evidence-binding acceptance test (spec 01b Wave 3 D7).
//
// Named criterion: "evidenceStatus counts an assumption WITH a non-empty evidence reference as
// evidence-backed and one without as asserted-only; an empty ledger is 0/0." Pure.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evidenceStatus } from './evidence.js'
import type { Canvas } from '@procezio/schema'

const withLedger = (assumptions: unknown[]): Canvas =>
  ({
    schema_version: '1.2',
    process: { name: 'p' },
    lanes: [],
    zones: [],
    nodes: [],
    edges: [],
    assumptions,
  }) as unknown as Canvas

test('an assumption with an evidence reference is evidence-backed', () => {
  const s = evidenceStatus(
    withLedger([
      { statement: 'x', source: 'log', confidence: 'high', evidence: 'ERP export 2026-07' },
      { statement: 'y', source: 'gut', confidence: 'low' },
      { statement: 'z', source: 'gut', confidence: 'low', evidence: '   ' }, // blank = not backed
    ]),
  )
  assert.deepEqual(s, { backed: 1, asserted: 2 }, 'a blank evidence string does not count')
})

test('an empty ledger is 0 backed / 0 asserted', () => {
  assert.deepEqual(evidenceStatus(withLedger([])), { backed: 0, asserted: 0 })
})
