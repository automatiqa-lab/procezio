// v0.4 zone-completeness tests: named missing items, never percentages.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zoneCompleteness } from './completeness.js'
import type { Canvas } from '@procezio/schema'

const emptyProcess = { name: '', trigger: '', end_state: '', owner: '', north_star: '' }

function canvas(partial: Partial<Canvas>): Canvas {
  return {
    schema_version: '1.2',
    process: emptyProcess,
    lanes: [],
    nodes: [],
    edges: [],
    zones: [],
    ...partial,
  }
}

const missingFor = (c: Canvas, zone: number): string[] =>
  zoneCompleteness(c).find((z) => z.zone === zone)?.missing ?? ['<<zone not returned>>']

test('always returns one entry per zone (1-8), in order', () => {
  const zones = zoneCompleteness(canvas({}))
  assert.deepEqual(
    zones.map((z) => z.zone),
    [1, 2, 3, 4, 5, 6, 7, 8],
  )
})

test('an empty canvas names the Frame anchor gaps, never a percentage', () => {
  const frame = missingFor(canvas({}), 1)
  assert.ok(frame.includes('a north-star metric'), 'the anchor metric leads the Frame gaps')
  assert.ok(frame.includes('the trigger'))
  for (const item of frame) assert.doesNotMatch(item, /%|\d+\s*%|percent/i, 'never a percentage')
})

test('a fully framed process closes zone 1', () => {
  const framed = canvas({
    process: {
      name: 'P2P',
      trigger: 'a PR is raised',
      end_state: 'invoice paid',
      owner: 'AP',
      north_star: 'cut cycle time from 5 days to 1',
    },
  })
  assert.deepEqual(missingFor(framed, 1), [], 'no Frame gaps remain')
})

test('zone 2 asks for a map, then a Start/Step/End once nodes exist', () => {
  assert.ok(missingFor(canvas({}), 2).includes('a process map (no steps drawn yet)'))
  const onlyStep = canvas({
    nodes: [{ id: 'n1', type: 'Step', lane: 'l', label: 'do it' }],
    lanes: [{ id: 'l', actor: 'clerk' }],
  })
  const map = missingFor(onlyStep, 2)
  assert.ok(map.includes('a Start node'))
  assert.ok(map.includes('an End node'))
  assert.ok(!map.includes('at least one Step'), 'a Step is present')
})

test('zone 3 asks for friction only once steps exist', () => {
  assert.deepEqual(missingFor(canvas({}), 3), [], 'no steps yet -> no friction gap')
  const withStep = canvas({ nodes: [{ id: 'n1', type: 'Step', lane: 'l', label: 'x' }] })
  assert.ok(missingFor(withStep, 3).includes('friction (no waste pinned yet)'))
})

test('zone 4 counts unprofiled steps', () => {
  const c = canvas({
    nodes: [
      { id: 'n1', type: 'Step', lane: 'l', label: 'a' },
      { id: 'n2', type: 'Step', lane: 'l', label: 'b' },
    ],
    audit_tags: [
      { id: 't1', node_id: 'n1', data: 'structured', rules: 'explicit', exceptions: 'rare' },
    ],
  })
  assert.ok(
    missingFor(c, 4).includes('a data/rules profile for 1 step'),
    'one step still unprofiled',
  )
})

test('zone 5 wants at least one idea; zone 6 wants triage then a committed score', () => {
  assert.ok(missingFor(canvas({}), 5).includes('at least one improvement idea'))
  const untriaged = canvas({ opportunities: [{ id: 'o1', title: 'automate match' }] })
  assert.deepEqual(missingFor(untriaged, 5), [], 'an idea exists')
  assert.ok(missingFor(untriaged, 6).includes('triage of the ideas'))
  const nowUnscored = canvas({ opportunities: [{ id: 'o1', title: 'x', triage: 'Now' }] })
  assert.ok(missingFor(nowUnscored, 6).includes('a committed score for the Now pile'))
})

test('zones 7 and 8 open only once an idea is committed', () => {
  const noCommit = canvas({ opportunities: [{ id: 'o1', title: 'x', triage: 'Now' }] })
  assert.deepEqual(missingFor(noCommit, 7), [], 'nothing committed -> risk gate not yet demanded')
  assert.deepEqual(missingFor(noCommit, 8), [], 'nothing committed -> no case demanded')
  const committed = canvas({
    opportunities: [{ id: 'o1', title: 'x', triage: 'Now', committed: true }],
  })
  assert.ok(missingFor(committed, 7).includes('the risk checks'))
  assert.ok(missingFor(committed, 8).includes('the improvement case'))
})

test('zone 7 is scoped per committed idea: another idea’s gates do not cover an unchecked one', () => {
  // o1 is committed with NO gates; o2 (also committed) has a cleared gate. A global check would
  // see "some gate exists" and pass - but o1 still needs its own risk checks.
  const c = canvas({
    opportunities: [
      { id: 'o1', title: 'a', triage: 'Now', committed: true },
      { id: 'o2', title: 'b', triage: 'Now', committed: true },
    ],
    gates: [{ opportunity_id: 'o2', check: 'data-privacy', status: 'cleared' }],
  })
  assert.ok(missingFor(c, 7).includes('the risk checks'), 'o1 has no gates -> still missing')
})

test('zone 7 clears only when every committed idea has cleared gates', () => {
  const c = canvas({
    opportunities: [{ id: 'o1', title: 'a', triage: 'Now', committed: true }],
    gates: [{ opportunity_id: 'o1', check: 'data-privacy', status: 'cleared' }],
  })
  assert.deepEqual(missingFor(c, 7), [], 'the one committed idea has a cleared gate -> zone 7 done')
})

test('the derived view is deterministic (same canvas, byte-identical result)', () => {
  const c = canvas({ opportunities: [{ id: 'o1', title: 'x', triage: 'Now', committed: true }] })
  assert.equal(JSON.stringify(zoneCompleteness(c)), JSON.stringify(zoneCompleteness(c)))
})
