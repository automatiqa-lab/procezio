// v0.4 credibility tests: the ladder and the named-source export gate (no LLM).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { credibilityLadder, exportBlockers, canExport } from './credibility.js'
import type { Canvas, Provenance } from '@procezio/schema'

function canvas(partial: Partial<Canvas>): Canvas {
  return {
    schema_version: '1.2',
    process: { name: 'P', trigger: '', end_state: '', owner: '', north_star: '' },
    lanes: [],
    nodes: [],
    edges: [],
    zones: [],
    ...partial,
  }
}

test('a bare session sits at L1 (draft from memory) and cannot claim decision-ready', () => {
  const cr = credibilityLadder(canvas({}))
  assert.equal(cr.level, 1)
  assert.equal(cr.decisionReady, false)
  assert.equal(cr.claim, 'draft for verification')
})

test('a mapped, friction-hunted, data-audited session reaches L2', () => {
  const cr = credibilityLadder(
    canvas({
      nodes: [{ id: 'n1', type: 'Step', lane: 'l', label: 'x' }],
      friction: [{ id: 'f1', waste: 'Waiting', node_id: 'n1' }],
      audit_tags: [
        { id: 't1', node_id: 'n1', data: 'structured', rules: 'explicit', exceptions: 'rare' },
      ],
    }),
  )
  assert.equal(cr.level, 2)
  assert.equal(cr.label, 'friction-hunted and data-audited')
  assert.equal(cr.decisionReady, false, 'L2 is still below decision-ready (that is L3)')
})

test('pencil (unaccepted agent) evidence never raises the ladder; acceptance does', () => {
  const c = canvas({
    nodes: [{ id: 'n1', type: 'Step', lane: 'l', label: 'x' }],
    friction: [{ id: 'f1', waste: 'Waiting', node_id: 'n1' }],
    audit_tags: [
      { id: 't1', node_id: 'n1', data: 'structured', rules: 'explicit', exceptions: 'rare' },
    ],
  })
  // Both evidence items are agent suggestions still awaiting review: L1, not L2 - a
  // claim about work the human never did would be the overclaim the ladder guards.
  const pencil: Provenance = { state: 'pencil' }
  const allPencil = new Map<string, Provenance>([
    ['friction:f1', pencil],
    ['audit_tag:t1', pencil],
  ])
  assert.equal(credibilityLadder(c, allPencil).level, 1, 'pencil evidence does not count')
  // The human accepts them -> ink -> the same canvas now honestly claims L2.
  const ink: Provenance = { state: 'ink' }
  const allInk = new Map<string, Provenance>([
    ['friction:f1', ink],
    ['audit_tag:t1', ink],
  ])
  assert.equal(credibilityLadder(c, allInk).level, 2, 'accepted evidence counts')
  // Elements absent from the provenance map (human-authored ink) count as before.
  assert.equal(credibilityLadder(c, new Map()).level, 2)
  // And the provenance-less call keeps the old canvas-only behavior.
  assert.equal(credibilityLadder(c).level, 2)
})

test('L2 needs BOTH friction and audit - friction alone stays L1', () => {
  const cr = credibilityLadder(
    canvas({
      nodes: [{ id: 'n1', type: 'Step', lane: 'l', label: 'x' }],
      friction: [{ id: 'f1', waste: 'Waiting', node_id: 'n1' }],
    }),
  )
  assert.equal(cr.level, 1, 'no data audit yet')
})

test('a low-confidence assumption with no verify_by blocks export', () => {
  const c = canvas({
    assumptions: [{ statement: '400 invoices/mo', source: 'gut feel', confidence: 'low' }],
  })
  const blockers = exportBlockers(c)
  assert.equal(blockers.length, 1)
  assert.match(blockers[0] ?? '', /Unacknowledged assumption/)
  assert.equal(canExport(c), false)
})

test('naming a verify_by acknowledges the assumption and clears the gate', () => {
  const c = canvas({
    assumptions: [
      {
        statement: '400 invoices/mo',
        source: 'gut feel',
        confidence: 'low',
        verify_by: 'pull the AP log',
      },
    ],
  })
  assert.deepEqual(exportBlockers(c), [])
  assert.equal(canExport(c), true)
})

test('a higher-confidence assumption does not block even without a verify_by', () => {
  const c = canvas({
    assumptions: [{ statement: '400 invoices/mo', source: 'AP log', confidence: 'high' }],
  })
  assert.equal(canExport(c), true)
})

test('the export gate is stable-ordered: assumptions before figures', () => {
  const c = canvas({
    assumptions: [{ statement: 'A', source: 'x', confidence: 'low' }],
    cases: [
      {
        opportunity_id: 'o1',
        figures: [{ label: 'Savings', value: 'EUR 9k', source_ref: '' }],
        assumptions: [],
      },
    ],
  })
  const blockers = exportBlockers(c)
  assert.equal(blockers.length, 2)
  assert.match(blockers[0] ?? '', /assumption/i, 'assumption blocker first')
  assert.match(blockers[1] ?? '', /no source/i, 'figure blocker second')
})
