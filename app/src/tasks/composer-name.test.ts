// v0.4 C-TASK test - naming the composed to-be over a stub client.
//
// Named criterion: "runComposerNaming returns a trimmed {name, narrative} on valid output, null
// when there are no changes to name, and null on failure or invalid output; it labels only - it
// never sees or restates the numbers." Deterministic (stub client, no network).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runComposerNaming } from './composer-name.js'
import type { LlmClient, ComposeResult } from '@procezio/core'
import type { Canvas } from '@procezio/schema'

const metering = { model: 'stub', prompt_chars: 0, completion_chars: 0, attempts: 1, repairs: 0 }
function stub(value: unknown, ok = true): LlmClient {
  return {
    complete: async () => ({ text: '', metering }),
    requestJson: async () =>
      ok
        ? { ok: true as const, value: value as never, metering }
        : { ok: false as const, error: 'x', metering },
    probe: async () => ({ tier: 'T2' as const, reachable: true }),
  }
}

const CANVAS = {
  schema_version: '1.2',
  process: { name: 'p' },
  zones: [],
  nodes: [{ id: 'n1', type: 'Step', lane: 'buyer', label: 'match', zone: 2 }],
  edges: [],
} as unknown as Canvas

const WITH_CHANGES = {
  toBe: CANVAS,
  changes: [{ opportunity_id: 'o1', element_ref: 'n1', rung: 'Automate', note: 'auto-match' }],
  delta: { handoff_count: -1 },
} as unknown as ComposeResult

const NO_CHANGES = { toBe: CANVAS, changes: [], delta: {} } as unknown as ComposeResult

test('runComposerNaming trims a valid name + narrative', async () => {
  const out = await runComposerNaming(
    stub({
      name: '  Straight-through matching  ',
      narrative: '  Invoices clear without a chase.  ',
    }),
    CANVAS,
    WITH_CHANGES,
  )
  assert.deepEqual(out, {
    name: 'Straight-through matching',
    narrative: 'Invoices clear without a chase.',
  })
})

test('runComposerNaming returns null when there is nothing to name', async () => {
  const out = await runComposerNaming(stub({ name: 'x', narrative: 'y' }), CANVAS, NO_CHANGES)
  assert.equal(out, null, 'no changes -> no snapshot to name -> null (model is never called)')
})

test('runComposerNaming returns null on failure or invalid output', async () => {
  // ok=false simulates the real client's validate/repair loop having already rejected the output.
  assert.equal(await runComposerNaming(stub(null, false), CANVAS, WITH_CHANGES), null, 'failure')
  assert.equal(
    await runComposerNaming(stub({ name: '  ', narrative: 'y' }, false), CANVAS, WITH_CHANGES),
    null,
    'a blank name is invalid -> null',
  )
  assert.equal(
    await runComposerNaming(stub({ name: 'x' }, false), CANVAS, WITH_CHANGES),
    null,
    'a missing narrative -> null',
  )
})
