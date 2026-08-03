// Art. 50 marking on the export path, proved by round trip rather than by inspection.
//
// The claim under test is the one a regulator or a downstream reader would check: a sheet
// carrying agent-drafted content says so in a form a machine can detect, and a sheet the
// agent never touched says nothing at all. The second half matters as much as the first -
// an absent marking has to stay a truthful claim, or the presence of one means nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { countDrafted, documentLine, envelope, pdfInfoEntries, reviewStateOf } from '@procezio/core'
import type { Provenance } from '@procezio/schema'

import { DISCLOSURE, DISCLOSURE_WORDING } from '../disclosure/disclosure.generated.js'
import { pdfText } from './render.js'

/** The escape character, spelled out so the expectations below stay readable. */
const BSLASH = String.fromCharCode(92)

/** A provenance map shaped like the store's: agent items born pencil, human items ink. */
function provenanceOf(spec: {
  pencil: number
  acceptedFromPencil: number
  human: number
}): ReadonlyMap<string, Provenance> {
  const map = new Map<string, Provenance>()
  let n = 0
  for (let i = 0; i < spec.pencil; i++) map.set(`p${n++}`, { state: 'pencil' })
  for (let i = 0; i < spec.acceptedFromPencil; i++)
    map.set(`a${n++}`, { state: 'ink', accepted_by: 'local-user', accepted_at: null })
  for (let i = 0; i < spec.human; i++) map.set(`h${n++}`, { state: 'ink' })
  return map
}

const envelopeFor = (provenance: ReadonlyMap<string, Provenance>) => {
  const counts = countDrafted(provenance)
  return envelope({
    system: DISCLOSURE.system,
    scope: DISCLOSURE.scope,
    drafted: counts.items_drafted,
    total: counts.items_total,
    reviewState: reviewStateOf(counts),
  })
}

test('a canvas the agent never touched carries no marking anywhere', () => {
  const provenance = provenanceOf({ pencil: 0, acceptedFromPencil: 0, human: 9 })
  const counts = countDrafted(provenance)

  assert.equal(counts.items_drafted, 0)
  assert.equal(documentLine(counts, DISCLOSURE_WORDING, counts.pending), '')
  assert.equal(envelopeFor(provenance), null)
  assert.deepEqual(pdfInfoEntries(envelopeFor(provenance)), [])
})

test('accepted agent work is counted, and human work never is', () => {
  const provenance = provenanceOf({ pencil: 0, acceptedFromPencil: 7, human: 17 })
  const counts = countDrafted(provenance)

  assert.equal(counts.items_drafted, 7)
  assert.equal(counts.items_total, 24)
  assert.equal(counts.pending, 0)
  assert.equal(reviewStateOf(counts), 'accepted')
  assert.equal(
    documentLine(counts, DISCLOSURE_WORDING, counts.pending),
    'AI-assisted · 7 of 24 items drafted by the agent, accepted by the author',
  )
})

test('unreviewed pencil is disclosed as unreviewed, not as accepted', () => {
  const provenance = provenanceOf({ pencil: 2, acceptedFromPencil: 5, human: 10 })
  const counts = countDrafted(provenance)

  assert.equal(counts.items_drafted, 7)
  assert.equal(counts.pending, 2)
  assert.equal(reviewStateOf(counts), 'mixed')
  assert.equal(
    documentLine(counts, DISCLOSURE_WORDING, counts.pending),
    'AI-assisted · 7 drafted by the agent · 2 still pencil, not reviewed',
  )
})

test('no wording names the model - Art. 50 asks what, not which', () => {
  const lines: string[] = [
    DISCLOSURE_WORDING.session_notice,
    DISCLOSURE_WORDING.drafted,
    DISCLOSURE_WORDING.unreviewed,
    DISCLOSURE_WORDING.none,
  ]
  for (const line of lines) {
    assert.ok(!/model|gpt|claude|llama|qwen|mistral/i.test(line), `wording leaks a model: ${line}`)
  }
})

test('the PDF info entries a reader would look for are present and escaped', () => {
  const entries = pdfInfoEntries(
    envelopeFor(provenanceOf({ pencil: 1, acceptedFromPencil: 6, human: 17 })),
  )
  const keys = entries.map(([k]) => k)

  assert.deepEqual(keys, ['AIGenerated', 'AIScope', 'AIReviewState', 'AISchemaVersion'])
  assert.equal(entries.find(([k]) => k === 'AIGenerated')?.[1], 'true')
  assert.equal(entries.find(([k]) => k === 'AISchemaVersion')?.[1], 'automatiqa-disclosure/1')
  // Nothing in an entry may contain an unescaped PDF string delimiter.
  for (const [, v] of entries) assert.ok(!/(?<!\\)[()]/.test(v), `unescaped delimiter in ${v}`)
})

test('PDF literal strings escape the delimiters that would break the dictionary', () => {
  // A PDF literal string ends at an unbalanced ')', so both parens and the escape
  // character itself have to be escaped. CodeQL caught a duplicated backslash in this
  // character class; the behaviour it should have had is asserted here.
  assert.equal(pdfText('plain'), 'plain')
  assert.equal(pdfText('a(b)c'), 'a' + BSLASH + '(b' + BSLASH + ')c')
  assert.equal(pdfText('back' + BSLASH + 'slash'), 'back' + BSLASH + BSLASH + 'slash')
  assert.equal(
    pdfText(BSLASH + '(' + BSLASH + ')'),
    BSLASH + BSLASH + BSLASH + '(' + BSLASH + BSLASH + BSLASH + ')',
  )
})
