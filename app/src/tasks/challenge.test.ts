// C-TASK acceptance test - buildChallenge / challengeCandidate over a stub client.
//
// Named criterion (a, with h): "buildChallenge returns a validated ChallengePayload whose
// opportunity_id equals ctx.opportunityId even when the stub model echoes a different id."
//
// The model is a stub (no network), so this is deterministic. Live wording is the user's to
// verify with a real endpoint.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChallenge, challengeCandidate } from './challenge.js'
import type { ChallengeCtx } from './challenge.js'
import type { LlmClient, SchemaValidator } from '@procezio/core'

const metering = { model: 'stub', prompt_chars: 0, completion_chars: 0, attempts: 1, repairs: 0 }

// A stub that HONORS the injected validator, exactly like the real requestJson repair loop:
// it only yields ok:true when the task's own validateChallenge accepts the value, otherwise
// ok:false. So passing an invalid payload with ok=true exercises the hand-written
// type-guard (criterion f), not the short-circuit ok:false path. `ok=false` forces the
// unreachable/never-valid outcome regardless of the payload.
function stub(value: unknown, ok = true): LlmClient {
  return {
    complete: async () => ({ text: '', metering }),
    requestJson: async <T>(_messages: unknown, validate: SchemaValidator<T>) =>
      ok && validate(value)
        ? { ok: true as const, value: value as T, metering }
        : { ok: false as const, error: 'x', metering },
    probe: async () => ({ tier: 'T2' as const, reachable: true }),
  }
}

// A client whose requestJson throws, standing in for a transport error.
const throwing: LlmClient = {
  complete: async () => ({ text: '', metering }),
  requestJson: async () => {
    throw new Error('transport down')
  },
  probe: async () => ({ tier: 'T2' as const, reachable: true }),
}

const ctx: ChallengeCtx = {
  opportunityId: 'opp-1',
  title: 'Auto-match invoices',
  benefit: 4,
  effort: 2,
  evidence: '- zone 2: 3 manual reconciliation steps\n- zone 4: 40% rework friction',
}

test('buildChallenge returns a validated ChallengePayload whose opportunity_id equals ctx.opportunityId even when the stub model echoes a different id', async () => {
  // The model echoes a WRONG opportunity_id; the task must overwrite it with ctx's id (h).
  const echoedWrong = {
    opportunity_id: 'echoed-wrong',
    dimension: 'benefit',
    message: 'The benefit looks high given only two mapped gains - keep it, or revise?',
    evidence_refs: ['n1', 'f2'],
  }
  const payload = await buildChallenge(stub(echoedWrong), ctx)
  assert.ok(payload, 'a valid challenge is returned')
  assert.equal(
    payload?.opportunity_id,
    ctx.opportunityId,
    'the id is forced to ctx.opportunityId, never the model echo',
  )
  assert.equal(payload?.dimension, 'benefit', 'the dimension survives')
  assert.equal(payload?.message, echoedWrong.message, 'the wording survives')
  assert.deepEqual(payload?.evidence_refs, ['n1', 'f2'], 'the cited evidence survives')
})

test('buildChallenge returns null when the call fails or the transport throws', async () => {
  const good = {
    opportunity_id: 'opp-1',
    dimension: 'effort',
    message: 'The effort reads low for three manual steps - keep it, or revise?',
    evidence_refs: ['n1'],
  }
  assert.equal(await buildChallenge(stub(good, false), ctx), null, 'ok:false -> null')
  assert.equal(await buildChallenge(throwing, ctx), null, 'a thrown transport error -> null')
})

test('buildChallenge returns null when the model output is missing evidence_refs or has an invalid dimension', async () => {
  // ok=true, so the model "succeeds" structurally and the task's own validateChallenge is
  // what must reject these - proving the hand-written type-guard (criterion f) actually runs,
  // not the ok:false short-circuit already covered above.
  const noEvidence = { opportunity_id: 'opp-1', dimension: 'benefit', message: 'x' }
  assert.equal(
    await buildChallenge(stub(noEvidence), ctx),
    null,
    'missing evidence_refs -> validator rejects -> null',
  )
  const badDimension = {
    opportunity_id: 'opp-1',
    dimension: 'cost',
    message: 'x',
    evidence_refs: ['n1'],
  }
  assert.equal(
    await buildChallenge(stub(badDimension), ctx),
    null,
    'invalid dimension -> validator rejects -> null',
  )
  const emptyEvidence = {
    opportunity_id: 'opp-1',
    dimension: 'effort',
    message: 'x',
    evidence_refs: [],
  }
  assert.equal(
    await buildChallenge(stub(emptyEvidence), ctx),
    null,
    'empty evidence_refs -> validator rejects -> null',
  )
})

test('challengeCandidate produces an agent-authored, pencil challenge.raised carrying the forced payload', async () => {
  const good = {
    opportunity_id: 'echoed-wrong',
    dimension: 'benefit',
    message: 'The benefit reads high - keep it, or revise?',
    evidence_refs: ['n1', 'f2'],
  }
  const candidate = await challengeCandidate(stub(good), 'session-9', ctx)
  assert.ok(candidate, 'a candidate is produced')
  assert.equal(candidate?.type, 'challenge.raised', 'it is a challenge.raised event')
  assert.deepEqual(candidate?.author, { kind: 'agent', id: 'agent' }, 'it is agent-authored')
  assert.deepEqual(candidate?.provenance, { state: 'pencil' }, 'it is born pencil')
  const payload = candidate?.payload as {
    opportunity_id: string
    dimension: string
    message: string
    evidence_refs: string[]
  }
  assert.equal(
    payload.opportunity_id,
    ctx.opportunityId,
    'the payload id is forced to ctx.opportunityId',
  )
  assert.equal(payload.dimension, 'benefit', 'the dimension rides along')
  assert.equal(payload.message, good.message, 'the message rides along')
  assert.deepEqual(payload.evidence_refs, ['n1', 'f2'], 'the evidence refs ride along')
})

test('challengeCandidate returns null when no challenge could be worded', async () => {
  assert.equal(
    await challengeCandidate(stub(null, false), 'session-9', ctx),
    null,
    'a failed build -> null candidate',
  )
})
