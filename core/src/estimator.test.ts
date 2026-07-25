// v0.4 estimator/analysis tests: handoff count + HD-2 Connect detection (structural, no LLM).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handoffCount, connectCandidates, parseDuration, cycleTimeEstimate } from './estimator.js'
import type { Canvas, Node, Edge } from '@procezio/schema'

function canvas(nodes: Node[], edges: Edge[]): Canvas {
  return {
    schema_version: '1.2',
    process: { name: 'P', trigger: '', end_state: '', owner: '', north_star: '' },
    lanes: [],
    nodes,
    edges,
    zones: [],
  }
}

const step = (id: string, lane: string, systems?: string[]): Node => ({
  id,
  type: 'Step',
  lane,
  label: id,
  ...(systems ? { step_detail: { systems } } : {}),
})

test('handoffCount counts lane-crossing sequence edges only', () => {
  const c = canvas(
    [step('a', 'l1'), step('b', 'l2'), step('c', 'l2')],
    [
      { id: 'e1', from: 'a', to: 'b', kind: 'sequence' }, // l1 -> l2: a handoff
      { id: 'e2', from: 'b', to: 'c', kind: 'sequence' }, // l2 -> l2: same owner, not a handoff
      { id: 'e3', from: 'c', to: 'a', kind: 'exception-backedge' }, // rework: not a fresh handoff
    ],
  )
  assert.equal(handoffCount(c), 1)
})

test('HD-2 flags a re-key edge between two system-backed steps', () => {
  const c = canvas(
    [step('a', 'l1', ['ERP']), step('b', 'l2', ['CRM'])],
    [{ id: 'e1', from: 'a', to: 'b', kind: 'sequence', medium: 're-key' }],
  )
  const cand = connectCandidates(c)
  assert.equal(cand.length, 1)
  assert.deepEqual(cand[0], { edge_id: 'e1', from: 'a', to: 'b' })
})

test('HD-2 does NOT flag when the medium is not re-key', () => {
  const c = canvas(
    [step('a', 'l1', ['ERP']), step('b', 'l2', ['CRM'])],
    [{ id: 'e1', from: 'a', to: 'b', kind: 'sequence', medium: 'system' }],
  )
  assert.deepEqual(connectCandidates(c), [], 'a system link is already connected - nothing to flag')
})

test('HD-2 does NOT flag when either step is not system-backed', () => {
  const c = canvas(
    [step('a', 'l1', ['ERP']), step('b', 'l2')], // b has no systems
    [{ id: 'e1', from: 'a', to: 'b', kind: 'sequence', medium: 're-key' }],
  )
  assert.deepEqual(
    connectCandidates(c),
    [],
    're-key into a non-system step is not a Connect candidate',
  )
})

test('HD-2 is order-stable and finds every qualifying edge', () => {
  const c = canvas(
    [step('a', 'l1', ['ERP']), step('b', 'l2', ['CRM']), step('d', 'l3', ['WMS'])],
    [
      { id: 'e1', from: 'a', to: 'b', kind: 'sequence', medium: 're-key' },
      { id: 'e2', from: 'b', to: 'd', kind: 'sequence', medium: 're-key' },
    ],
  )
  const cand = connectCandidates(c)
  assert.deepEqual(
    cand.map((x) => x.edge_id),
    ['e1', 'e2'],
    'candidates follow edge order (deterministic)',
  )
})

// --- F1 what-if cycle-time estimate ------------------------------------------

test('parseDuration reads numbers + units, midpoints a range, and rejects unparseable text', () => {
  assert.equal(parseDuration('2 days'), 60 * 8 * 2)
  assert.equal(parseDuration('90 min'), 90)
  assert.equal(parseDuration('1 hour'), 60)
  assert.equal(parseDuration('3-5 days'), 60 * 8 * 4, 'a range uses the midpoint')
  assert.equal(parseDuration('soon'), null, 'no number -> null')
  assert.equal(parseDuration('42'), null, 'no unit -> null (never guess the unit)')
  assert.equal(parseDuration(undefined), null)
})

test('cycleTimeEstimate folds readable times, finds the biggest wait, and reports coverage', () => {
  const canvas = {
    schema_version: '1.2',
    process: { name: 'p' },
    zones: [],
    lanes: [],
    edges: [],
    nodes: [
      {
        id: 's1',
        type: 'Step',
        lane: 'a',
        label: 'enter',
        zone: 2,
        step_detail: { touch_time: { value: '30 min' } },
      },
      {
        id: 'w1',
        type: 'Wait',
        lane: 'a',
        label: 'approval',
        zone: 2,
        wait_detail: { duration: { value: '2 days' } },
      },
      {
        id: 'w2',
        type: 'Wait',
        lane: 'a',
        label: 'chase',
        zone: 2,
        wait_detail: { duration: { value: 'a while' } },
      },
    ],
  }
  const e = cycleTimeEstimate(canvas as unknown as Canvas)
  assert.equal(e.counted, 2, 'the two readable fields are counted')
  assert.equal(e.skipped, 1, 'the unreadable wait is reported, not silently dropped')
  assert.equal(e.total_minutes, 30 + 60 * 8 * 2)
  assert.equal(e.biggest_wait?.node_id, 'w1', 'the 2-day wait is the bottleneck')
})

test('cycleTimeEstimate on a timeless map counts nothing (never fabricates a total)', () => {
  const canvas = {
    schema_version: '1.2',
    process: { name: 'p' },
    zones: [],
    lanes: [],
    edges: [],
    nodes: [{ id: 's1', type: 'Step', lane: 'a', label: 'x', zone: 2 }],
  }
  const e = cycleTimeEstimate(canvas as unknown as Canvas)
  assert.equal(e.counted, 0)
  assert.equal(e.total_minutes, 0)
  assert.equal(e.biggest_wait, null)
})

test('parseDuration sums a compound duration and does not average its parts (review #1)', () => {
  assert.equal(parseDuration('1 hour 30 min'), 90, 'compound sums, never averages')
  assert.equal(parseDuration('2 days 4 hours'), 60 * 8 * 2 + 60 * 4)
})

test('a range with prefix text still uses the midpoint (never the upper bound)', () => {
  assert.equal(
    parseDuration('about 3-5 days'),
    parseDuration('3-5 days'),
    'prefix words change nothing',
  )
  assert.equal(parseDuration('usually 2 to 4 hours'), 3 * 60, 'midpoint of a prefixed to-range')
})
