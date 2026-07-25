// M2-01a acceptance test.
//
// Named criterion (CardContract, ImplPlan.testName):
//   "precompiled @procezio/schema validators accept the valid EventEnvelope + Canvas
//    corpora, reject schema-invalid payloads with ajv ErrorObject[] errors, and the
//    generated validator module contains zero eval/new Function"
//
// Why this card exists: the C8 event store used to construct ajv at runtime, which
// compiles schemas with `new Function`. Under the Solo bundle's strict CSP
// (`script-src 'self'`, no 'unsafe-eval') that blanks the app. This card replaces the
// runtime ajv with build-time precompiled STANDALONE validators exported from
// @procezio/schema. This test proves the precompiled validators are (a) importable and
// callable, (b) semantically identical to the runtime ajv path (same accept/reject, same
// ErrorObject[] shape), and (c) CSP-safe (zero eval / new Function in the shipped source).
//
// The corpora are the SAME ratified fixtures the schema + core tests use: the 15
// payload families in event-envelope.samples.json and the C5 Procure-to-Pay canvas.
// Invalids are produced with the SAME mutations canvas.schema.test.mjs / event-store.test.ts
// use (bogus type, empty payload, missing required field), so a divergence between the
// precompiled and runtime validators would fail here.
//
// Resolution: node --test runs from the repo root, so fixtures and the committed
// validators.cjs are read via process.cwd(). The validators are imported through the
// @procezio/schema package (the exact path core/app resolve at runtime), and the .cjs
// source is additionally read as text to statically prove the zero-eval property.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateEventEnvelope, validateCanvas } from '@procezio/schema'

const root = process.cwd()
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'))
const clone = (o) => structuredClone(o)

const events = readJson('schema/fixtures/event-envelope.samples.json')
const canvas = readJson('schema/fixtures/procure-to-pay.canvas.json')
// The v0.3->v1.1 amendment corpus (frame.set + assumption.added, schema_version
// '1.1'), kept in its own fixture so the ratified 15-family corpus stays frozen.
const amendment = readJson('schema/fixtures/amendment-v1.1.samples.json')

// --- (1) the precompiled validators are importable and callable ---------------

test('validateEventEnvelope and validateCanvas import from @procezio/schema as functions', () => {
  assert.equal(
    typeof validateEventEnvelope,
    'function',
    'validateEventEnvelope must be an exported function',
  )
  assert.equal(typeof validateCanvas, 'function', 'validateCanvas must be an exported function')
})

// --- (2) CSP-safe: the shipped validator source contains zero eval/new Function -

test('the generated validators.cjs contains zero eval / new Function (CSP-safe)', () => {
  const src = readFileSync(join(root, 'schema', 'src', 'validators.cjs'), 'utf8')
  assert.doesNotMatch(
    src,
    /\bnew\s+Function\s*\(|\beval\s*\(/,
    'precompiled validators must not contain eval/new Function - they ship into a strict-CSP browser bundle',
  )
})

// --- (3) accept: all 15 payload families validate -----------------------------

test('validateEventEnvelope accepts all 15 valid payload families', () => {
  assert.equal(events.length, 15, 'the ratified corpus has one sample per payload family')
  for (const e of events) {
    const ok = validateEventEnvelope(e)
    assert.equal(
      ok,
      true,
      `event ${e.type} must validate; errors:\n${JSON.stringify(validateEventEnvelope.errors, null, 2)}`,
    )
  }
})

// --- (4) reject: schema-invalid payloads fail with an ajv ErrorObject[] --------

test('validateEventEnvelope rejects schema-invalid payloads and exposes ajv ErrorObject[] errors', () => {
  // (a) bogus event type (matches no member of the EventType enum).
  const badType = clone(events[0])
  badType.type = 'bogus.type'
  assert.equal(validateEventEnvelope(badType), false, 'an unknown event type must be rejected')
  const errs = validateEventEnvelope.errors
  assert.ok(
    Array.isArray(errs) && errs.length > 0,
    'a rejection must carry a non-empty ajv error array',
  )
  // The ajv ErrorObject structure (keyword + instancePath) must be preserved - this is
  // the exact shape the event store returns to callers as AppendResult.errors.
  for (const err of errs) {
    assert.equal(typeof err.keyword, 'string', 'each error carries an ajv keyword')
    assert.equal(typeof err.instancePath, 'string', 'each error carries an ajv instancePath')
    assert.equal(typeof err.schemaPath, 'string', 'each error carries an ajv schemaPath')
  }

  // (b) empty payload (matches no family in the oneOf).
  const badPayload = clone(events[0])
  badPayload.payload = {}
  assert.equal(validateEventEnvelope(badPayload), false, 'an empty payload must be rejected')
  assert.ok(
    Array.isArray(validateEventEnvelope.errors) && validateEventEnvelope.errors.length > 0,
    'empty-payload rejection carries ajv errors',
  )

  // (c) missing a required envelope field.
  const badMissing = clone(events[0])
  delete badMissing.ts
  assert.equal(
    validateEventEnvelope(badMissing),
    false,
    'a missing required field must be rejected',
  )
})

// --- (4b) amendment v1.1: the precompiled validators accept the new families ---

test('validateEventEnvelope accepts the v1.1 frame.set and assumption.added events', () => {
  // The amended schema (v1.0->v1.1) adds two additive event families. The SAME
  // precompiled validator must now accept them, at schema_version '1.1', without
  // any change to how the (unchanged) v1.0 corpus above validates.
  const byType = new Set(amendment.map((e) => e.type))
  assert.ok(byType.has('frame.set'), 'the amendment fixture exercises frame.set')
  assert.ok(byType.has('assumption.added'), 'the amendment fixture exercises assumption.added')
  for (const e of amendment) {
    assert.equal(e.schema_version, '1.1', `amended event ${e.type} carries schema_version 1.1`)
    assert.equal(
      validateEventEnvelope(e),
      true,
      `amended event ${e.type} must validate; errors:\n${JSON.stringify(validateEventEnvelope.errors, null, 2)}`,
    )
  }
})

test('validateCanvas accepts a v1.1 canvas: assumptions ledger, a rung-less triaged Opportunity, and a varies node', () => {
  // Exercise the additive Canvas-shape relaxations in one document: the new
  // assumptions[] ledger, an Opportunity that carries triage but NOT rung (rung
  // relaxed to optional, v0.3 A5), and a node flagged varies (v0.3 A4).
  const c = clone(canvas)
  c.assumptions = [
    { statement: '~40 requisitions/day', source: 'Zone 1', confidence: 'low', owner: 'Ops lead' },
  ]
  c.opportunities = [
    { id: 'op-triaged', title: 'Standardize the requisition template', triage: 'Maybe' },
  ]
  c.nodes[0].varies = true
  assert.equal(
    validateCanvas(c),
    true,
    `a v1.1 canvas must validate; errors:\n${JSON.stringify(validateCanvas.errors, null, 2)}`,
  )
})

// --- (5) canvas: the root document validator accepts the C5 canvas, rejects broken -

test('validateCanvas accepts the C5 Procure-to-Pay canvas and rejects a structurally broken one', () => {
  assert.equal(
    validateCanvas(canvas),
    true,
    `the ratified canvas fixture must validate; errors:\n${JSON.stringify(validateCanvas.errors, null, 2)}`,
  )
  // Remove a required Frame anchor field: the same mutation canvas.schema.test.mjs uses.
  const broken = clone(canvas)
  delete broken.process.north_star
  assert.equal(validateCanvas(broken), false, 'a canvas missing north_star must be rejected')
  assert.ok(
    Array.isArray(validateCanvas.errors) && validateCanvas.errors.length > 0,
    'a rejected canvas carries ajv errors',
  )
})
