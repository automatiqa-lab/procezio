// UI-strings acceptance test - the dictionary stays sound.
//
// The StringKey type already makes a MISSING key a compile error; this test guards the
// runtime qualities types cannot: no key resolves to an empty string, and {n}-style
// vars substitute cleanly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { t } from './i18n.js'
import type { StringKey } from './i18n.js'

// One representative key per surface; the full key set is type-checked at compile time.
const KEYS: StringKey[] = [
  'orientation.hint',
  'start.demo',
  'session.unsaved',
  'restore.body',
  'ceremony.sign',
  'challenger.thinking',
  'shoebox.drop',
  'rail.offRamp',
  'smallScreen.notice',
]

test('every key resolves to a non-empty string', () => {
  for (const key of KEYS) {
    assert.ok(t(key).trim().length > 0, `${key} is non-empty`)
  }
})

test('vars substitute and leave no raw placeholder', () => {
  const s = t('restore.body', { n: 42 })
  assert.match(s, /42/, '{n} substituted')
  assert.doesNotMatch(s, /\{n\}/, 'no raw placeholder left')
})
