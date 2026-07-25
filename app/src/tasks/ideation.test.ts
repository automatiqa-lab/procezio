// C-TASK #1c acceptance test - suggestCandidates + ideationCandidates over a stub client.
//
// Named criterion: "suggestCandidates returns trimmed titles on valid output and null on
// failure/invalid; ideationCandidates builds agent-authored, born-pencil, judgment-free
// opportunity.created candidates (id + title only, no score)."
//
// Deterministic (stub client, no network). Live suggestions are the user's to verify.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ideationCandidates, suggestCandidates } from './ideation.js'
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
const CTX = {
  steps: 'raise requisition; three-way match',
  friction: 'Waiting on approver',
  existing: 'auto-close orders',
}

test('suggestCandidates returns trimmed titles from a valid list', async () => {
  const out = await suggestCandidates(
    stub({ candidates: ['  match invoices to POs  ', 'route exceptions'] }),
    CTX,
  )
  assert.deepEqual(out, ['match invoices to POs', 'route exceptions'], 'titles are trimmed')
})

test('suggestCandidates returns null on failure or invalid output', async () => {
  assert.equal(await suggestCandidates(stub(null, false), CTX), null, 'a failed call -> null')
  assert.equal(
    await suggestCandidates(stub({ candidates: [] }, false), CTX),
    null,
    'an empty list -> null',
  )
  assert.equal(
    await suggestCandidates(stub({ candidates: ['', '  '] }, false), CTX),
    null,
    'blank titles -> null',
  )
})

test('ideationCandidates builds agent-authored, pencil, judgment-free opportunities', () => {
  const cands = ideationCandidates('sess', ['match invoices', 'route exceptions'], ['o-1', 'o-2'])
  assert.equal(cands.length, 2, 'one candidate per title')
  assert.ok(
    cands.every((c) => c.author.kind === 'agent'),
    'agent-authored',
  )
  assert.ok(
    cands.every((c) => c.provenance.state === 'pencil'),
    'born pencil',
  )
  assert.ok(
    cands.every((c) => c.type === 'opportunity.created'),
    'opportunity.created',
  )
  const opp = (cands[0]!.payload as { opportunity: { id: string; title: string } }).opportunity
  assert.deepEqual(
    Object.keys(opp).sort(),
    ['id', 'title'],
    'id + title only - no score/rung/triage',
  )
  assert.equal(opp.id, 'o-1', 'the minted id is used')
})
