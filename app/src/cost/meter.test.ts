// Cost meter acceptance test (spec 01b section 12, G2): a client-computed estimate.
//
// Named criterion: "estimateUsd prices a call from its character counts + model (never negative,
// never zero for an unknown model); the CostMeter accumulates calls and notifies subscribers;
// reset clears it." Pure math + a bus, no network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateUsd, CostMeter } from './meter.js'
import type { LlmMetering } from '@procezio/core'

const meter = (model: string, p: number, c: number): LlmMetering => ({
  model,
  prompt_chars: p,
  completion_chars: c,
  attempts: 1,
  repairs: 0,
})

test('estimateUsd prices input and output tokens by model tier', () => {
  // 4000 prompt chars = 1000 tokens; 400 completion = 100 tokens.
  const haiku = estimateUsd('claude-haiku-4-5', 4000, 400)
  const opus = estimateUsd('claude-opus-4-8', 4000, 400)
  assert.ok(haiku > 0, 'a call costs something')
  assert.ok(opus > haiku, 'opus is priced above haiku for the same call')
})

test('an unknown model is priced mid-tier, never free', () => {
  assert.ok(estimateUsd('some-local-model', 4000, 400) > 0, 'unknown != free (never understate)')
})

test('estimateUsd clamps negative character counts to zero', () => {
  assert.equal(estimateUsd('claude-sonnet-5', -100, -100), 0)
})

test('CostMeter accumulates across calls and notifies subscribers', () => {
  const m = new CostMeter()
  const seen: number[] = []
  const unsub = m.subscribe((s) => seen.push(s.calls))
  m.record(meter('claude-sonnet-5', 4000, 400))
  m.record(meter('claude-sonnet-5', 4000, 400))
  assert.equal(m.get().calls, 2, 'two calls counted')
  assert.ok(m.get().usd > 0, 'cost accrued')
  assert.deepEqual(seen, [1, 2], 'each record notified with the running call count')
  unsub()
  m.record(meter('claude-sonnet-5', 4000, 400))
  assert.deepEqual(seen, [1, 2], 'an unsubscribed listener is not called again')
})

test('reset clears the running total and notifies', () => {
  const m = new CostMeter()
  m.record(meter('claude-haiku-4-5', 4000, 400))
  let after = -1
  m.subscribe((s) => (after = s.usd))
  m.reset()
  assert.equal(m.get().calls, 0)
  assert.equal(m.get().usd, 0)
  assert.equal(after, 0, 'subscribers see the cleared total')
})
