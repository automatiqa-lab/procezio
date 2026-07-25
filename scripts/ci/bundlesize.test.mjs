// Acceptance test for the ci:bundlesize gate: it stays green within budget and goes RED
// when a chunk (or the total) exceeds it - a budget that can't fail is theatre (specs/04
// DoD). Runs against a temp assets dir with BUNDLESIZE_SKIP_BUILD=1, so no real build is
// needed and the test is fast and deterministic.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const gatePath = fileURLToPath(new URL('../gates/bundlesize.mjs', import.meta.url))

// Incompressible (random) bytes, so the gzipped size the gate measures is ~= the raw size we
// asked for - giving each test predictable control over which budget it trips.
function fakeChunk(dir, name, rawKb) {
  writeFileSync(join(dir, name), randomBytes(rawKb * 1024))
}

function runGate(assetsDir, env) {
  return spawnSync(process.execPath, [gatePath], {
    encoding: 'utf8',
    env: { ...process.env, BUNDLESIZE_SKIP_BUILD: '1', BUNDLESIZE_ASSETS_DIR: assetsDir, ...env },
  })
}

test('bundlesize passes when chunks are within budget', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-bundlesize-ok-'))
  fakeChunk(dir, 'index-abc.js', 40)
  fakeChunk(dir, 'MapZone-def.js', 20)
  const r = runGate(dir, { BUNDLESIZE_TOTAL_KB: '260', BUNDLESIZE_MAX_CHUNK_KB: '95' })
  assert.equal(r.status, 0, `expected pass, got ${r.status}\n${r.stdout}${r.stderr}`)
  assert.match(r.stdout, /within budget/)
})

test('bundlesize goes RED when the largest chunk exceeds its budget', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-bundlesize-chunk-'))
  fakeChunk(dir, 'index-abc.js', 40)
  // A tiny max-chunk budget forces the largest chunk over the line.
  const r = runGate(dir, { BUNDLESIZE_MAX_CHUNK_KB: '1' })
  assert.equal(r.status, 1, `expected RED, got ${r.status}\n${r.stdout}`)
  assert.match(r.stderr, /largest chunk/)
})

test('bundlesize goes RED when the total exceeds its budget', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-bundlesize-total-'))
  fakeChunk(dir, 'index-abc.js', 40)
  fakeChunk(dir, 'MapZone-def.js', 40)
  const r = runGate(dir, { BUNDLESIZE_TOTAL_KB: '1', BUNDLESIZE_MAX_CHUNK_KB: '9999' })
  assert.equal(r.status, 1, `expected RED, got ${r.status}\n${r.stdout}`)
  assert.match(r.stderr, /total JS/)
})

test('bundlesize fails loudly when there is no build output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-bundlesize-empty-'))
  const r = runGate(dir, {})
  assert.equal(r.status, 1, `expected RED, got ${r.status}\n${r.stdout}`)
  assert.match(r.stderr, /no \.js chunks/)
})
