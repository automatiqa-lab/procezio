// C-TASK acceptance test - the provider presets (local-first, BYO).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDER_PRESETS, presetById } from './providers.js'

test('the default (first) preset is a local model - no key, private', () => {
  const first = PROVIDER_PRESETS[0]!
  assert.equal(first.id, 'ollama', 'local-first: Ollama is the default')
  assert.equal(first.authStyle, 'none', 'a local model needs no auth header')
  assert.equal(first.keyNeeded, false, 'no key prompted for a local model')
})

test('each preset carries an endpoint hint, a model example, an auth style, and a note', () => {
  for (const p of PROVIDER_PRESETS) {
    assert.ok(p.label.length > 0, `${p.id} has a label`)
    assert.ok(p.modelExample.length > 0, `${p.id} has a model example`)
    assert.ok(
      ['bearer', 'x-api-key', 'api-key', 'none'].includes(p.authStyle),
      `${p.id} has a valid auth style`,
    )
    assert.ok(p.note.length > 0, `${p.id} has guidance`)
  }
})

test('cloud providers that block browser calls are marked keyless (proxy holds the key)', () => {
  const anthropic = presetById('anthropic')
  assert.equal(anthropic.authStyle, 'none', 'Anthropic via proxy: no key in the browser')
  assert.equal(anthropic.keyNeeded, false)
  assert.match(anthropic.note, /proxy/i, 'the note points to the proxy')
})

test('presetById falls back to the local default for an unknown id', () => {
  assert.equal(presetById('nope').id, 'ollama', 'unknown -> local default')
  assert.equal(presetById('openai').id, 'openai', 'known id resolves')
})
