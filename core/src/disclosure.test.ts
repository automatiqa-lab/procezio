// EU AI Act Art. 50 disclosure acceptance test.
//
// Named criterion: "the envelope is null when nothing was drafted and carries the five
// facts when something was; the visible line renders the accepted and the unreviewed
// wording from config and is empty at drafted == 0; the PNG/PDF/XMP expressions all
// derive from the same envelope; marking is idempotent via the schema field; and no
// visible output ever names the model."
//
// Pure functions over an injected clock, so every assertion is exact.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DISCLOSURE_SCHEMA,
  alreadyMarked,
  documentLine,
  envelope,
  pdfInfoEntries,
  pngTextChunks,
  xmp,
} from './disclosure.js'

const NOW = (): Date => new Date('2026-08-03T09:00:00.000Z')
const WORDING = {
  drafted: 'AI-assisted · {drafted} of {total} items drafted by the agent, accepted by the author',
  unreviewed: 'AI-assisted · {drafted} drafted by the agent · {pending} still pencil, not reviewed',
  none: '',
}

const built = (drafted: number, total: number, reviewState: 'accepted' | 'mixed' = 'accepted') =>
  envelope({ system: 'procezio', scope: ['canvas_items'], drafted, total, reviewState, now: NOW })

// --- conditional emission ------------------------------------------------------

test('nothing drafted means no envelope at all - absence stays a truthful claim', () => {
  assert.equal(built(0, 12), null)
  assert.equal(envelope({ system: 'procezio', scope: [], drafted: 4, now: NOW }), null)
})

test('the envelope carries the five facts plus the counts, and never the model', () => {
  const env = built(3, 12)
  assert.deepEqual(env, {
    value: true,
    scope: ['canvas_items'],
    schema: DISCLOSURE_SCHEMA,
    system: 'procezio',
    review_state: 'accepted',
    items_drafted: 3,
    items_total: 12,
    ts: '2026-08-03T09:00:00.000Z',
  })
  assert.equal('model' in env!, false, 'the model is never named - not even in metadata')
})

// --- the visible line ----------------------------------------------------------

test('a human-only canvas produces NO line at all', () => {
  assert.equal(documentLine(null, WORDING), '')
  assert.equal(documentLine({ items_drafted: 0, items_total: 9 }, WORDING), '')
})

test('the accepted wording renders drafted-of-total', () => {
  assert.equal(
    documentLine(built(3, 12), WORDING),
    'AI-assisted · 3 of 12 items drafted by the agent, accepted by the author',
  )
})

test('the unreviewed wording renders as soon as anything is still pencil', () => {
  assert.equal(
    documentLine(built(5, 12, 'mixed'), WORDING, 2),
    'AI-assisted · 5 drafted by the agent · 2 still pencil, not reviewed',
  )
})

test('a bare count renders the same line as the full envelope (pure composers)', () => {
  assert.equal(
    documentLine({ items_drafted: 3, items_total: 12 }, WORDING),
    documentLine(built(3, 12), WORDING),
  )
})

// --- machine channels ----------------------------------------------------------

test('the PNG, PDF and XMP expressions all derive from the one envelope', () => {
  const env = built(3, 12, 'mixed')
  assert.deepEqual(pngTextChunks(env), [
    ['ai-generated', 'true'],
    ['ai-scope', 'canvas_items'],
    ['ai-review-state', 'mixed'],
    ['ai-schema', DISCLOSURE_SCHEMA],
  ])
  assert.deepEqual(pdfInfoEntries(env), [
    ['AIGenerated', 'true'],
    ['AIScope', 'canvas_items'],
    ['AIReviewState', 'mixed'],
    ['AISchemaVersion', DISCLOSURE_SCHEMA],
  ])
  const packet = xmp(env)
  assert.match(packet, /<aiq:aiGenerated>true<\/aiq:aiGenerated>/)
  assert.match(packet, /<aiq:schemaVersion>automatiqa-disclosure\/1<\/aiq:schemaVersion>/)
})

test('no marking at all when there is no envelope', () => {
  assert.deepEqual(pngTextChunks(null), [])
  assert.deepEqual(pdfInfoEntries(null), [])
  assert.equal(xmp(null), '')
})

// --- idempotency ---------------------------------------------------------------

test('marking is idempotent - a payload is recognised as already marked by its schema', () => {
  assert.equal(alreadyMarked({}), false)
  assert.equal(alreadyMarked({ ai_generated: { schema: 'other/9' } }), false)
  assert.equal(alreadyMarked({ ai_generated: built(1, 1) as unknown as object }), true)
})
