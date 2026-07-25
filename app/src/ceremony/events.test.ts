// Commit-ceremony event-builder acceptance tests (spec 01b section 5, D1).
//
// Named criterion: the commitment is the anti-anchoring trigger - a deliberate, human-ink
// sign + confirm that seals the committed scores and is the ONLY event that wakes the
// Challenger (which literally cannot speak before a `commitment` event exists). The full
// envelope shape matters here: replay and the rule engine key off these exact fields.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCommitmentCandidate } from './events.js'

test('commitment is human-authored ink with the full envelope shape', () => {
  const ev = buildCommitmentCandidate('sess', ['opp-1', 'opp-2'], 'Aleks')
  assert.equal(ev.type, 'commitment', 'the exact type the Challenger wake rule matches on')
  assert.equal(ev.author.kind, 'human', 'signing is a human act - never the agent')
  assert.equal(ev.author.id, 'local-user')
  assert.equal(ev.provenance.state, 'ink', 'a commitment is never a pencil draft')
  assert.equal(ev.session_id, 'sess')
  assert.equal(
    ev.correlation_id,
    'sess',
    'sessionId is carried as both session_id and correlation_id',
  )
  assert.equal(ev.causation_id, null)
  assert.equal(ev.compensates, null)
  assert.equal(ev.schema_version, '1.2')
  assert.equal(ev.event_id, undefined, 'event_id/ts come from the store providers, never here')
  assert.equal(ev.ts, undefined)
})

test('the payload carries the non-empty opportunity tuple and the signer verbatim', () => {
  const ev = buildCommitmentCandidate('sess', ['opp-1'], 'Aleks Sidorecs')
  const payload = ev.payload as { opportunity_ids: string[]; signed_by: string }
  assert.deepEqual(payload.opportunity_ids, ['opp-1'], 'exactly the committed ids, in order')
  assert.equal(payload.signed_by, 'Aleks Sidorecs', 'the named signer - accountability is visible')
  assert.deepEqual(
    Object.keys(payload).sort(),
    ['opportunity_ids', 'signed_by'],
    'nothing beyond the ratified CommitmentPayload fields',
  )
})
