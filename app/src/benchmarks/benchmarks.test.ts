// Benchmark shelf acceptance test (spec 01b Wave 2 E7): cited ranges, matched by process type.
//
// Named criterion: "benchmarksFor returns cited ranges when the process name matches a known type
// and an empty list otherwise; every benchmark carries a source (nothing is presented uncited)."
// The pull-as-estimate flow (a low-confidence, verify-by assumption) is covered by the assumptions
// projection tests; this covers the pure matching + integrity.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { benchmarksFor } from './benchmarks.js'

test('a P2P process name matches invoice benchmarks, each cited', () => {
  const b = benchmarksFor('Purchase-to-Pay')
  assert.ok(b.length > 0, 'benchmarks are shown for a known type')
  assert.ok(
    b.every((x) => x.source.trim().length > 0),
    'every range is cited - nothing is presented uncited',
  )
  assert.ok(
    b.some((x) => /invoice/i.test(x.metric)),
    'the invoice-cost benchmark is present',
  )
})

test('order-to-cash and carrier names match their own shelves', () => {
  assert.ok(benchmarksFor('Order-to-Cash').some((x) => /DSO|outstanding/i.test(x.metric)))
  assert.ok(benchmarksFor('Carrier onboarding').some((x) => /onboarding/i.test(x.metric)))
})

test('an unknown process type shows no benchmarks (never invents a range)', () => {
  assert.deepEqual(benchmarksFor('Something entirely bespoke'), [])
  assert.deepEqual(benchmarksFor(''), [])
})
