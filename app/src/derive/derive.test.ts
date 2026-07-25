// Acceptance test for the map-driven autopopulation derivations (card 3060):
//   "deriveFrictionSuggestions raises Defects/Waiting/Extra-processing friction only
//    from explicit map signals (rework, chasing, re-key); deriveOpportunitySuggestions
//    mirrors HD-2 Connect candidates as titled ideas; deriveAuditDraft pre-fills only
//    the axes the node's detail actually signals - all deterministic, all citing the
//    map source."
//
// Pure module - runs headless, no store, no DOM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { project } from '@procezio/core'
import type { Canvas, Node } from '@procezio/schema'
import {
  deriveAuditDraft,
  deriveFrictionSuggestions,
  deriveOpportunitySuggestions,
} from './derive.js'

/** A canvas literal for derivation tests (shape mirrors the C9 empty projection). */
function canvasWith(nodes: Node[], edges: Canvas['edges']): Canvas {
  return { ...project([]), nodes, edges }
}

const step = (id: string, extra?: Partial<Node>): Node => ({
  id,
  type: 'Step',
  lane: 'l1',
  label: id,
  zone: 2,
  ...extra,
})

test('friction derivation: rework -> Defects, chasing -> Waiting, re-key handoff -> Extra-processing on the downstream node', () => {
  const canvas = canvasWith(
    [
      step('a', { step_detail: { rework: true } }),
      step('b', { type: 'Wait', wait_detail: { chasing: true } }),
      step('c'),
      step('d'),
    ],
    [{ id: 'e-cd', from: 'c', to: 'd', kind: 'sequence', medium: 're-key' }],
  )
  const out = deriveFrictionSuggestions(canvas)
  assert.deepEqual(
    out.map((f) => [f.id, f.waste, f.node_id]),
    [
      ['drv-fr-rework-a', 'Defects', 'a'],
      ['drv-fr-chasing-b', 'Waiting', 'b'],
      ['drv-fr-rekey-e-cd', 'Extra-processing', 'd'],
    ],
  )
  // Every suggestion cites the map as its source - honesty is part of the contract.
  for (const f of out) assert.match(f.note ?? '', /^From the map:/)
})

test('friction derivation is empty on a map with no signals (divergent zones stay empty)', () => {
  const canvas = canvasWith(
    [step('a'), step('b')],
    [{ id: 'e-ab', from: 'a', to: 'b', kind: 'sequence', medium: 'system' }],
  )
  assert.deepEqual(deriveFrictionSuggestions(canvas), [])
})

test('opportunity derivation mirrors HD-2: a re-key handoff between two system-backed steps becomes a Connect idea pinned to the edge', () => {
  const sys = (id: string): Node => step(id, { step_detail: { systems: ['ERP'] } })
  const canvas = canvasWith(
    [sys('a'), sys('b'), step('c')],
    [
      { id: 'e-ab', from: 'a', to: 'b', kind: 'sequence', medium: 're-key' }, // HD-2 hit
      { id: 'e-bc', from: 'b', to: 'c', kind: 'sequence', medium: 're-key' }, // c not system-backed
    ],
  )
  const out = deriveOpportunitySuggestions(canvas)
  assert.equal(out.length, 1, 'only the system-to-system re-key qualifies')
  assert.equal(out[0]?.id, 'drv-opp-connect-e-ab')
  assert.deepEqual(out[0]?.target_refs, ['e-ab'])
  assert.match(out[0]?.title ?? '', /^Connect: stop re-keying between/)
})

test('audit draft pre-fills only signalled axes: systems -> structured data, basis/standardized -> rules, varies -> occasional exceptions', () => {
  assert.deepEqual(
    deriveAuditDraft(
      step('a', { step_detail: { systems: ['ERP'], standardized: 'standardized' } }),
    ),
    { data: 'structured', rules: 'explicit' },
  )
  assert.deepEqual(
    deriveAuditDraft(
      step('d', { type: 'Decision', decision_detail: { basis: 'judgment' }, varies: true }),
    ),
    { rules: 'judgment', exceptions: 'occasional' },
  )
  assert.deepEqual(
    deriveAuditDraft(step('bare')),
    {},
    'no signal, no pre-fill - the unsignalled axis stays a human question',
  )
})
