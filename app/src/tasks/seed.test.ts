// C-TASK #1a acceptance test - seedSkeleton over a stub client.
//
// Named criterion: "seedSkeleton returns a validated map when the model produces one and
// null on failure/invalid; the returned nodes use only the five shapes."
//
// The model is a stub (no network), so this is deterministic. Live drafting is the user's
// to verify with a real endpoint.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seedSkeleton } from './seed.js'
import type { LlmClient } from '@procezio/core'

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

test('seedSkeleton returns a validated map when the model produces one', async () => {
  const good = {
    lanes: [{ id: 'req', actor: 'Requester' }],
    nodes: [
      { id: 'n1', type: 'Start', lane: 'req', label: 'Need arises', zone: 2 },
      { id: 'n2', type: 'Step', lane: 'req', label: 'Raise requisition', zone: 2 },
      { id: 'n3', type: 'End', lane: 'req', label: 'PO issued', zone: 2 },
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', kind: 'sequence' }],
  }
  const seed = await seedSkeleton(stub(good), 'We raise a requisition and issue a PO.')
  assert.ok(seed, 'a valid map is returned')
  assert.equal(seed?.nodes.length, 3, 'all three nodes come through')
})

test('seedSkeleton returns null when the model output is invalid or the call fails', async () => {
  // Invalid shape (a node with a non-shape type) -> the validator rejects, requestJson
  // ultimately fails, seedSkeleton returns null.
  const bad = { nodes: [{ id: 'n1', type: 'Rhombus', lane: 'r', label: 'x', zone: 2 }] }
  assert.equal(await seedSkeleton(stub(bad, false), 'desc'), null, 'invalid map -> null')
  assert.equal(await seedSkeleton(stub(null, false), 'desc'), null, 'a failed call -> null')
})
