// Plain-language linter acceptance test (spec 01b Wave 2 C5): advisory, deterministic.
//
// Named criterion: "plain text scores a low grade with no issues; dense/jargon-laden text scores a
// higher grade and flags issues; empty text returns no issues." Advisory only - nothing here gates
// the methodology.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plainLanguage } from './plainLanguage.js'

test('plain, short wording scores low with no issues', () => {
  const r = plainLanguage('We pay the bill. It is late a lot.')
  assert.ok(r.grade < 6, `plain text reads low (was ${r.grade})`)
  assert.deepEqual(r.issues, [])
})

test('dense, jargon-laden wording scores higher and flags issues', () => {
  const r = plainLanguage(
    'We will leverage cross-functional synergies to operationalize a holistic reconciliation paradigm that comprehensively addresses the multifaceted inefficiencies inherent throughout the procurement lifecycle.',
  )
  assert.ok(r.grade > 12, `dense text reads high (was ${r.grade})`)
  assert.ok(
    r.issues.some((i) => /jargon/i.test(i)),
    'jargon is flagged',
  )
})

test('an over-long sentence is flagged even if words are simple', () => {
  const long = 'We ' + Array.from({ length: 30 }, () => 'go').join(' ') + '.'
  const r = plainLanguage(long)
  assert.ok(
    r.issues.some((i) => /split/i.test(i)),
    'a 30-word sentence suggests splitting',
  )
})

test('empty text returns no issues', () => {
  assert.deepEqual(plainLanguage(''), { grade: 0, issues: [] })
})
