// C-TASK #1d acceptance test - draftCase / draftCaseCandidate over a stub client.
//
// Named criterion: "draftCase forces opportunity_id to ctx.opportunityId even when the
// stub model echoes a different id."
//
// The model is a stub (no network), so this is deterministic. Live drafting is the user's
// to verify with a real endpoint.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftCase, draftCaseCandidate } from './draft.js'
import type { DraftCtx } from './draft.js'
import type { CasePayload } from '@procezio/schema'
import type { LlmClient, SchemaValidator } from '@procezio/core'

const metering = { model: 'stub', prompt_chars: 0, completion_chars: 0, attempts: 1, repairs: 0 }

// A stub that HONORS the injected validator, exactly like the real requestJson repair loop:
// it only yields ok:true when the task's own validateDraft accepts the value, otherwise
// ok:false. So passing an invalid payload with ok=true exercises the hand-written
// type-guard, not the short-circuit ok:false path. `ok=false` forces the unreachable/
// never-valid outcome regardless of the payload.
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

const ctx: DraftCtx = {
  opportunityId: 'opp-1',
  title: 'Auto-match invoices',
  canvas:
    '- step n1: manual three-way match\n- friction f2: 40% rework\n- data tag d3: PO + GRN + invoice',
}

test('draftCase forces opportunity_id to ctx.opportunityId even when the stub model echoes a different id', async () => {
  // The model echoes a WRONG opportunity_id and mixes a cost figure with a benefit figure
  // that carries a benefit_class; the task must overwrite the id with ctx's and preserve
  // the benefit classification untouched (v0.3 A1).
  const echoedWrong = {
    opportunity_id: 'echoed-wrong',
    figures: [
      { label: 'License', value: '2000 CHF/yr', source_ref: 'd3', kind: 'cost' },
      {
        label: 'Freed hours',
        value: '120 h/yr',
        source_ref: 'f2',
        kind: 'benefit',
        benefit_class: 'capacity-release',
      },
    ],
    assumptions: [{ statement: '40% rework holds at volume', source: 'f2', confidence: 'med' }],
  }
  const payload = await draftCase(stub(echoedWrong), ctx)
  assert.ok(payload, 'a valid case is returned')
  assert.equal(
    payload.opportunity_id,
    ctx.opportunityId,
    'the id is forced to ctx.opportunityId, never the model echo',
  )
  assert.equal(payload.figures.length, 2, 'both the cost and benefit figures survive')
  const [cost, benefit] = payload.figures
  assert.ok(cost && benefit, 'both figures are present')
  assert.equal(cost.kind, 'cost', 'the cost figure survives')
  assert.equal(benefit.kind, 'benefit', 'the benefit figure survives')
  assert.equal(
    benefit.benefit_class,
    'capacity-release',
    'benefit_class is preserved, never stripped',
  )
})

test('draftCase returns null when the call fails or the transport throws', async () => {
  const good = {
    opportunity_id: 'opp-1',
    figures: [{ label: 'License', value: '2000 CHF/yr', source_ref: 'd3', kind: 'cost' }],
    assumptions: [],
  }
  assert.equal(await draftCase(stub(good, false), ctx), null, 'ok:false -> null')
  assert.equal(await draftCase(throwing, ctx), null, 'a thrown transport error -> null')
})

test('draftCase rejects a figure missing its source_ref, an invalid kind, or an invalid benefit_class', async () => {
  // ok=true, so the model "succeeds" structurally and the task's own validateDraft is what
  // must reject these - proving the hand-written type-guard actually runs, not the ok:false
  // short-circuit already covered above.
  const noSource = {
    opportunity_id: 'opp-1',
    figures: [{ label: 'License', value: '2000 CHF/yr', kind: 'cost' }],
    assumptions: [],
  }
  assert.equal(await draftCase(stub(noSource), ctx), null, 'figure missing source_ref -> null')
  const badKind = {
    opportunity_id: 'opp-1',
    figures: [{ label: 'License', value: '2000 CHF/yr', source_ref: 'd3', kind: 'expense' }],
    assumptions: [],
  }
  assert.equal(await draftCase(stub(badKind), ctx), null, 'invalid kind -> null')
  const badClass = {
    opportunity_id: 'opp-1',
    figures: [
      {
        label: 'Freed hours',
        value: '120 h/yr',
        source_ref: 'f2',
        kind: 'benefit',
        benefit_class: 'soft',
      },
    ],
    assumptions: [],
  }
  assert.equal(await draftCase(stub(badClass), ctx), null, 'invalid benefit_class -> null')
})

test('draftCase rejects an empty figure label or value, and an empty assumption statement or source', async () => {
  const emptyLabel = {
    opportunity_id: 'opp-1',
    figures: [{ label: '', value: '2000 CHF/yr', source_ref: 'd3', kind: 'cost' }],
    assumptions: [],
  }
  assert.equal(await draftCase(stub(emptyLabel), ctx), null, 'empty label -> null')
  const emptyValue = {
    opportunity_id: 'opp-1',
    figures: [{ label: 'License', value: '', source_ref: 'd3', kind: 'cost' }],
    assumptions: [],
  }
  assert.equal(await draftCase(stub(emptyValue), ctx), null, 'empty value -> null')
  const emptyStatement = {
    opportunity_id: 'opp-1',
    figures: [],
    assumptions: [{ statement: '', source: 'f2', confidence: 'med' }],
  }
  assert.equal(
    await draftCase(stub(emptyStatement), ctx),
    null,
    'empty assumption statement -> null',
  )
  const emptySource = {
    opportunity_id: 'opp-1',
    figures: [],
    assumptions: [{ statement: '40% rework holds', source: '', confidence: 'med' }],
  }
  assert.equal(await draftCase(stub(emptySource), ctx), null, 'empty assumption source -> null')
})

test('draftCase rejects an assumption with an invalid confidence', async () => {
  const badConfidence = {
    opportunity_id: 'opp-1',
    figures: [],
    assumptions: [{ statement: '40% rework holds', source: 'f2', confidence: 'maybe' }],
  }
  assert.equal(await draftCase(stub(badConfidence), ctx), null, 'invalid confidence -> null')
})

test('draftCaseCandidate produces an agent-authored, pencil case.drafted carrying the forced payload', async () => {
  const good = {
    opportunity_id: 'echoed-wrong',
    figures: [
      { label: 'License', value: '2000 CHF/yr', source_ref: 'd3', kind: 'cost' },
      {
        label: 'Freed hours',
        value: '120 h/yr',
        source_ref: 'f2',
        kind: 'benefit',
        benefit_class: 'capacity-release',
      },
    ],
    assumptions: [{ statement: '40% rework holds', source: 'f2', confidence: 'high' }],
  }
  const candidate = await draftCaseCandidate(stub(good), 'session-9', ctx)
  assert.ok(candidate, 'a candidate is produced')
  assert.equal(candidate?.type, 'case.drafted', 'it is a case.drafted event')
  assert.deepEqual(candidate?.author, { kind: 'agent', id: 'agent' }, 'it is agent-authored')
  assert.deepEqual(candidate?.provenance, { state: 'pencil' }, 'it is born pencil')
  assert.equal(candidate?.causation_id, null, 'no causation id')
  assert.equal(candidate?.correlation_id, 'session-9', 'the correlation id is the session id')
  assert.equal(candidate?.compensates, null, 'it compensates nothing')
  assert.equal(candidate?.schema_version, '1.0', 'the schema version is pinned')
  const payload = candidate?.payload as CasePayload
  assert.equal(
    payload.opportunity_id,
    ctx.opportunityId,
    'the payload id is forced to ctx.opportunityId',
  )
  const [, benefit] = payload.figures
  assert.ok(benefit, 'the benefit figure is present')
  assert.equal(benefit.benefit_class, 'capacity-release', 'the benefit class rides along')
})

test('draftCaseCandidate returns null when no case could be drafted', async () => {
  assert.equal(
    await draftCaseCandidate(stub(null, false), 'session-9', ctx),
    null,
    'a failed draft -> null candidate',
  )
})
