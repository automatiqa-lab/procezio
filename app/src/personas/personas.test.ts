// Stakeholder personas acceptance test (spec v0.4 section 6, Wave 2 B4).
//
// Named criterion: "persona.defined upserts a stakeholder into canvas.stakeholder_personas (human
// ink); persona.annotated appends a simulated perspective (agent pencil) that the export gate
// blocks until confirmed; a confirm event by the same id flips confirmed and clears the block;
// runPersonaAnnotation keeps only real cited ids and returns null on failure." Deterministic.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import { exportBlockers } from '@procezio/core'
import type { LlmClient } from '@procezio/core'
import type { Canvas, StakeholderPersona } from '@procezio/schema'
import {
  buildPersonaDefinedCandidate,
  buildPersonaAnnotatedCandidate,
  buildPersonaConfirmedCandidate,
} from './events.js'
import { runPersonaAnnotation } from './annotate.js'

function freshStore() {
  const store = createCanvasStore({
    eventIdProvider: () => randomUUID(),
    tsProvider: () => '2026-07-12T00:00:00.000Z',
  })
  store.getState().dispatch(buildSessionStartedCandidate(randomUUID(), 'P'))
  return store
}

const PERSONA: StakeholderPersona = {
  id: 'sp-1',
  name: 'Priya',
  role: 'Finance controller',
  perspective: 'Will not sign off without a hard-savings number.',
}

test('persona.defined upserts a stakeholder (human ink)', () => {
  const store = freshStore()
  const sid = store.getState().sessionId!
  const cand = buildPersonaDefinedCandidate(sid, PERSONA)
  assert.equal(cand.author.kind, 'human')
  assert.equal(cand.provenance.state, 'ink')
  store.getState().dispatch(cand)
  assert.equal(getError(store.getState()), null)
  const personas = getCanvas(store.getState()).stakeholder_personas ?? []
  assert.equal(personas.length, 1)
  assert.equal(personas[0]!.name, 'Priya')
})

test('persona.annotated appends a simulated perspective, born pencil, and blocks export', () => {
  const store = freshStore()
  const sid = store.getState().sessionId!
  store.getState().dispatch(buildPersonaDefinedCandidate(sid, PERSONA))
  const ann = buildPersonaAnnotatedCandidate(sid, {
    id: 'ann-1',
    persona_id: 'sp-1',
    text: 'Where is the hard-savings figure?',
  })
  assert.equal(ann.author.kind, 'agent')
  assert.equal(ann.author.id, 'stakeholder')
  assert.equal(ann.provenance.state, 'pencil')
  store.getState().dispatch(ann)
  assert.equal(getError(store.getState()), null)
  const canvas = getCanvas(store.getState())
  assert.equal((canvas.simulated_perspectives ?? []).length, 1)
  assert.equal(canvas.simulated_perspectives![0]!.confirmed, undefined, 'unconfirmed by default')
  assert.ok(
    exportBlockers(canvas).some((b) => b.includes('simulated perspective')),
    'an unconfirmed simulated perspective blocks export',
  )
})

test('confirming a perspective flips confirmed and clears the export block', () => {
  const store = freshStore()
  const sid = store.getState().sessionId!
  store.getState().dispatch(buildPersonaDefinedCandidate(sid, PERSONA))
  store
    .getState()
    .dispatch(
      buildPersonaAnnotatedCandidate(sid, { id: 'ann-1', persona_id: 'sp-1', text: 'A concern.' }),
    )
  store
    .getState()
    .dispatch(
      buildPersonaConfirmedCandidate(sid, { id: 'ann-1', persona_id: 'sp-1', text: 'A concern.' }),
    )
  const canvas = getCanvas(store.getState())
  assert.equal((canvas.simulated_perspectives ?? []).length, 1, 'upserted by id, not duplicated')
  assert.equal(canvas.simulated_perspectives![0]!.confirmed, true)
  assert.ok(
    !exportBlockers(canvas).some((b) => b.includes('simulated perspective')),
    'a confirmed perspective no longer blocks export',
  )
})

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
  process: { name: 'P' },
  zones: [],
  nodes: [{ id: 'n1', type: 'Step', lane: 'a', label: 'x', zone: 2 }],
  edges: [],
} as unknown as Canvas

test('runPersonaAnnotation trims text and keeps only real cited ids', async () => {
  const out = await runPersonaAnnotation(
    stub({ text: '  A concern about handoffs.  ', cited_refs: ['n1', 'ghost'] }),
    PERSONA,
    CANVAS,
  )
  assert.deepEqual(out, { text: 'A concern about handoffs.', cited_refs: ['n1'] })
})

test('runPersonaAnnotation returns null on failure', async () => {
  assert.equal(await runPersonaAnnotation(stub(null, false), PERSONA, CANVAS), null)
})

test('confirming a perspective preserves its cited_refs and anchor_ref (review #2)', () => {
  const store = freshStore()
  const sid = store.getState().sessionId!
  store.getState().dispatch(buildPersonaDefinedCandidate(sid, PERSONA))
  store.getState().dispatch(
    buildPersonaAnnotatedCandidate(sid, {
      id: 'ann-1',
      persona_id: 'sp-1',
      text: 'ties to the match step',
      anchor_ref: 'n-match',
      cited_refs: ['n-match', 'a-1'],
    }),
  )
  store.getState().dispatch(
    buildPersonaConfirmedCandidate(sid, {
      id: 'ann-1',
      persona_id: 'sp-1',
      text: 'ties to the match step',
      anchor_ref: 'n-match',
      cited_refs: ['n-match', 'a-1'],
    }),
  )
  const sp = (getCanvas(store.getState()).simulated_perspectives ?? [])[0]!
  assert.equal(sp.confirmed, true)
  assert.deepEqual(sp.cited_refs, ['n-match', 'a-1'], 'evidence refs survive the confirm')
  assert.equal(sp.anchor_ref, 'n-match', 'the anchor survives the confirm')
})
