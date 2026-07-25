// v0.4 C-TASK test - the Challenger's graded interjection over a stub client.
//
// Named criterion: "runChallengeIssued forces the committed opportunity_id, keeps only cited_refs
// that exist on the canvas, and returns null when the model fails or cites nothing real; the
// dimension and citable set are decided from the canvas, not the model." Deterministic (stub).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runChallengeIssued,
  buildChallengeIssuedCandidate,
  buildChallengeAnsweredCandidate,
  challengedDimension,
  citableRefs,
  assembleEvidence,
} from './challenger.js'
import type { LlmClient } from '@procezio/core'
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
  audit_tags: [{ id: 'a1', node_id: 'n1', data: 2, rules: 1, exceptions: 0 }],
  friction: [],
  opportunities: [],
} as unknown as Canvas

const CTX = {
  opportunityId: 'o1',
  title: 'auto-match invoices',
  benefit: 4,
  effort: 2,
  tier: 'probe' as const,
  dimension: 'effort' as const,
  evidence: assembleEvidence(CANVAS),
  citable: citableRefs(CANVAS),
}

test('citableRefs collects node, data-tag and friction ids', () => {
  assert.deepEqual([...citableRefs(CANVAS)].sort(), ['a1', 'n1'])
})

test('challengedDimension presses effort when it is scored at or below benefit', () => {
  assert.equal(challengedDimension(4, 2), 'effort', 'a low effort claim is the usual over-optimism')
  assert.equal(challengedDimension(2, 4), 'benefit', 'else press the benefit')
  assert.equal(challengedDimension(3, 3), 'effort', 'a tie presses effort')
})

test('runChallengeIssued forces the opportunity id and keeps only real cited_refs', async () => {
  const out = await runChallengeIssued(
    stub({ message: 'the systems do not connect today', cited_refs: ['n1', 'ghost', 'a1'] }),
    { ...CTX, opportunityId: 'o1' },
  )
  assert.notEqual(out, null)
  assert.equal(out!.opportunity_id, 'o1', 'the committed id is forced, never the model output')
  assert.equal(out!.tier, 'probe')
  assert.equal(out!.dimension, 'effort')
  assert.deepEqual(out!.cited_refs, ['n1', 'a1'], 'the foreign id "ghost" is dropped')
})

test('runChallengeIssued returns null on failure or when nothing real is cited', async () => {
  assert.equal(await runChallengeIssued(stub(null, false), CTX), null, 'a failed call -> null')
  assert.equal(
    await runChallengeIssued(stub({ message: 'm', cited_refs: ['ghost'] }), CTX),
    null,
    'no cited ref exists on the canvas -> no evidence line -> null',
  )
})

test('buildChallengeIssuedCandidate is agent-authored (challenger), born pencil', () => {
  const cand = buildChallengeIssuedCandidate('sess', {
    opportunity_id: 'o1',
    tier: 'probe',
    dimension: 'effort',
    message: 'm',
    cited_refs: ['n1'],
  })
  assert.equal(cand.type, 'challenge.issued')
  assert.equal(cand.author.kind, 'agent')
  assert.equal(cand.author.id, 'challenger')
  assert.equal(cand.provenance.state, 'pencil')
  assert.equal(cand.schema_version, '1.2')
})

test('buildChallengeAnsweredCandidate is human-ink and carries the response', () => {
  const cand = buildChallengeAnsweredCandidate('sess', 'o1', 'revised')
  assert.equal(cand.type, 'challenge.answered')
  assert.equal(cand.author.kind, 'human')
  assert.equal(cand.provenance.state, 'ink')
  const p = cand.payload as { opportunity_id: string; response: string }
  assert.equal(p.opportunity_id, 'o1')
  assert.equal(p.response, 'revised')
})
