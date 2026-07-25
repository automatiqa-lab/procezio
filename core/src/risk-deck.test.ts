// Risk-deck acceptance test (spec 01b Wave 3 F7): deterministic risk heuristics per step.
//
// Named criterion: "riskPrompts deals a card for a chasing wait, a rework step, an improvised step,
// a multi-system step, and a judgment decision; a clean map trips nothing." Pure, no LLM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { riskPrompts } from './risk-deck.js'
import type { Canvas } from '@procezio/schema'

const withNodes = (nodes: unknown[]): Canvas =>
  ({
    schema_version: '1.2',
    process: { name: 'p' },
    lanes: [],
    zones: [],
    nodes,
    edges: [],
  }) as unknown as Canvas

test('each heuristic deals exactly its card', () => {
  const prompts = riskPrompts(
    withNodes([
      {
        id: 'w1',
        type: 'Wait',
        lane: 'a',
        label: 'chase',
        zone: 2,
        wait_detail: { chasing: true },
      },
      {
        id: 's1',
        type: 'Step',
        lane: 'a',
        label: 'rework',
        zone: 2,
        step_detail: { rework: true },
      },
      {
        id: 's2',
        type: 'Step',
        lane: 'a',
        label: 'ad-hoc',
        zone: 2,
        step_detail: { standardized: 'improvised' },
      },
      {
        id: 's3',
        type: 'Step',
        lane: 'a',
        label: 'multi',
        zone: 2,
        step_detail: { systems: ['ERP', 'CRM'] },
      },
      {
        id: 'd1',
        type: 'Decision',
        lane: 'a',
        label: 'judge',
        zone: 2,
        decision_detail: { basis: 'judgment' },
      },
    ]),
  )
  assert.equal(prompts.length, 5, 'one card per tripped heuristic')
  assert.ok(prompts.some((p) => p.node_id === 'w1' && /chase/i.test(p.prompt)))
  assert.ok(prompts.some((p) => p.node_id === 's3' && /systems/i.test(p.prompt)))
  assert.ok(prompts.some((p) => p.node_id === 'd1' && /judgment/i.test(p.prompt)))
})

test('a clean, detail-free map trips no risk cards', () => {
  const prompts = riskPrompts(
    withNodes([
      { id: 's1', type: 'Step', lane: 'a', label: 'plain', zone: 2 },
      {
        id: 'w1',
        type: 'Wait',
        lane: 'a',
        label: 'wait',
        zone: 2,
        wait_detail: { chasing: false },
      },
    ]),
  )
  assert.deepEqual(prompts, [])
})
