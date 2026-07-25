// C14 acceptance + conformance suite for the idle and dwell timers.
//
// The timers are pure functions of INJECTED timestamps: the "current time" is a
// parameter sourced from an event ts, never a wall clock. This suite proves the
// boolean triggers over injected timestamps, the deterministic TimerTrigger output
// shape the orchestration loop feeds back, and - by static source scan - the
// absence of eval/Function/network/clock-RNG/node:* in the module.
//
// node --test runs from the repo root. The MODULE (timers.ts) may not touch node:*;
// THIS test file may, and uses node:fs only to statically scan the module source.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { idleTriggered, dwellTriggered, evaluateIdleTimer, evaluateDwellTimer } from './timers.js'

const root = process.cwd()

// --- idleTriggered ------------------------------------------------------------

test('idleTriggered: true iff asOf - lastActivity >= threshold, from injected timestamps only', () => {
  // 5 minutes idle, threshold 5 min -> boundary is inclusive -> true.
  assert.equal(
    idleTriggered({
      lastActivityTs: '2026-07-06T10:00:00Z',
      asOfTs: '2026-07-06T10:05:00Z',
      thresholdMs: 300_000,
    }),
    true,
    'exactly at threshold triggers (>=)',
  )
  // 4 minutes idle, threshold 5 min -> false.
  assert.equal(
    idleTriggered({
      lastActivityTs: '2026-07-06T10:00:00Z',
      asOfTs: '2026-07-06T10:04:00Z',
      thresholdMs: 300_000,
    }),
    false,
    'below threshold does not trigger',
  )
  // Malformed timestamp never triggers and never throws.
  assert.equal(
    idleTriggered({ lastActivityTs: 'nope', asOfTs: '2026-07-06T10:05:00Z', thresholdMs: 1 }),
    false,
  )
})

// --- dwellTriggered -----------------------------------------------------------

test('dwellTriggered: true iff asOf - zoneEntered >= threshold, from injected timestamps only', () => {
  assert.equal(
    dwellTriggered({
      zoneEnteredTs: '2026-07-06T10:00:00Z',
      asOfTs: '2026-07-06T10:10:00Z',
      thresholdMs: 600_000,
    }),
    true,
    'zone unchanged for the dwell threshold triggers',
  )
  assert.equal(
    dwellTriggered({
      zoneEnteredTs: '2026-07-06T10:00:00Z',
      asOfTs: '2026-07-06T10:09:00Z',
      thresholdMs: 600_000,
    }),
    false,
    'below dwell threshold does not trigger',
  )
})

// --- evaluate*Timer: deterministic TimerTrigger output ------------------------

test('evaluateIdleTimer: returns a deterministic idle TimerTrigger or null', () => {
  const trigger = evaluateIdleTimer({
    lastActivityTs: '2026-07-06T10:00:00Z',
    asOfTs: '2026-07-06T10:06:00Z',
    thresholdMs: 300_000,
  })
  assert.deepEqual(trigger, {
    kind: 'idle',
    sinceTs: '2026-07-06T10:00:00Z',
    asOfTs: '2026-07-06T10:06:00Z',
    elapsedMs: 360_000,
  })
  // Below threshold -> null (no trigger event to feed back).
  assert.equal(
    evaluateIdleTimer({
      lastActivityTs: '2026-07-06T10:00:00Z',
      asOfTs: '2026-07-06T10:01:00Z',
      thresholdMs: 300_000,
    }),
    null,
  )
})

test('evaluateDwellTimer: returns a deterministic dwell TimerTrigger carrying the zone, or null', () => {
  const trigger = evaluateDwellTimer({
    zoneId: 6,
    zoneEnteredTs: '2026-07-06T10:00:00Z',
    asOfTs: '2026-07-06T10:12:00Z',
    thresholdMs: 600_000,
  })
  assert.deepEqual(trigger, {
    kind: 'dwell',
    zoneId: 6,
    sinceTs: '2026-07-06T10:00:00Z',
    asOfTs: '2026-07-06T10:12:00Z',
    elapsedMs: 720_000,
  })
  assert.equal(
    evaluateDwellTimer({
      zoneId: 6,
      zoneEnteredTs: '2026-07-06T10:00:00Z',
      asOfTs: '2026-07-06T10:05:00Z',
      thresholdMs: 600_000,
    }),
    null,
  )
})

// --- Determinism --------------------------------------------------------------

test('timers are deterministic: identical injected timestamps yield identical output', () => {
  const idleIn = {
    lastActivityTs: '2026-07-06T10:00:00Z',
    asOfTs: '2026-07-06T10:20:00Z',
    thresholdMs: 600_000,
  }
  assert.deepEqual(evaluateIdleTimer({ ...idleIn }), evaluateIdleTimer({ ...idleIn }))
  const dwellIn = {
    zoneId: 3,
    zoneEnteredTs: '2026-07-06T10:00:00Z',
    asOfTs: '2026-07-06T10:20:00Z',
    thresholdMs: 600_000,
  }
  assert.deepEqual(evaluateDwellTimer({ ...dwellIn }), evaluateDwellTimer({ ...dwellIn }))
})

// --- Static source conformance (layering guarantees) --------------------------

test('timers.ts contains no eval/Function, no network, no clock/RNG, no node:* import', () => {
  const src = readFileSync(join(root, 'core', 'src', 'timers.ts'), 'utf8')
  assert.doesNotMatch(src, /eval\(|Function\(|new\s+Function/, 'no eval/Function anywhere')
  assert.doesNotMatch(
    src,
    /\bfetch\s*\(|\baxios\b|XMLHttpRequest|\bWebSocket\b/,
    'no network client calls',
  )
  assert.doesNotMatch(
    src,
    /from\s+['"][^'"]*(?:openai|anthropic|\bllm)[^'"]*['"]/i,
    'no LLM/provider module import',
  )
  // Date.parse (a pure parser) is allowed; the non-deterministic Date.now /
  // Math.random call sites are what must be absent.
  assert.doesNotMatch(src, /Date\.now\s*\(|Math\.random\s*\(/, 'no clock or RNG call')
  assert.doesNotMatch(src, /from\s+['"]node:/, 'the timers must not import from node:*')
})
