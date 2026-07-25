// Re-assessment scheduler acceptance test (spec 01b Wave 3 G4).
//
// Named criterion: "reviewSchedule returns days in [3, 365]; a volatile (all gut-feel) ledger
// re-checks sooner than a steady (all verified) one; the interval expands with the pass count."
// Pure and clock-free (days, not dates).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reviewSchedule } from './review-schedule.js'
import type { Canvas } from '@procezio/schema'

const ledger = (confidences: string[]): Canvas =>
  ({
    schema_version: '1.2',
    process: { name: 'p' },
    lanes: [],
    zones: [],
    nodes: [],
    edges: [],
    assumptions: confidences.map((c, i) => ({ statement: `a${i}`, source: 's', confidence: c })),
  }) as unknown as Canvas

test('a steady (verified) ledger re-checks later than a volatile (gut-feel) one', () => {
  const steady = reviewSchedule(ledger(['high', 'high', 'high']), 1)
  const volatile = reviewSchedule(ledger(['low', 'low', 'low']), 1)
  assert.ok(steady.days > volatile.days, `steady (${steady.days}) > volatile (${volatile.days})`)
})

test('the interval expands with the pass count', () => {
  const first = reviewSchedule(ledger(['high']), 0)
  const later = reviewSchedule(ledger(['high']), 3)
  assert.ok(later.days > first.days, 'a later pass waits longer')
})

test('days are always clamped into [3, 365]', () => {
  for (const pass of [0, 1, 3, 8, 20]) {
    for (const conf of [['high'], ['low'], []]) {
      const d = reviewSchedule(ledger(conf), pass).days
      assert.ok(d >= 3 && d <= 365, `pass ${pass} conf [${conf.join(',')}]: ${d} in range`)
    }
  }
})

test('an empty ledger gives a short first re-check with an honest reason', () => {
  const s = reviewSchedule(ledger([]), 0)
  assert.ok(s.days <= 14)
  assert.match(s.reason, /No ledger/i)
})
