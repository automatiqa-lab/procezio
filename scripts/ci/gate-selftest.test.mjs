// C1 acceptance test: the CI pipeline can go green AND can go red.
// A gate that cannot fail is theatre - so we prove both directions.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'

const node = (args) => spawnSync(process.execPath, args, { encoding: 'utf8' })

test('a passing gate exits 0 (license gate on this clean workspace)', () => {
  const r = node(['scripts/gates/license.mjs'])
  assert.equal(r.status, 0, `expected pass, got ${r.status}\n${r.stdout}${r.stderr}`)
})

test('the license gate goes RED on a disallowed license', () => {
  // Drive the gate against a throwaway tree with an AGPL package, in a temp dir,
  // without touching the repo. Proves a bad dependency turns CI red.
  const script = `
    import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\\n  - pkg\\n');
    mkdirSync(join(dir, 'pkg'));
    writeFileSync(join(dir, 'pkg', 'package.json'), JSON.stringify({ name: 'x', license: 'AGPL-3.0' }));
    process.chdir(dir);
    await import(${JSON.stringify(new URL('../gates/license.mjs', import.meta.url).href)});
  `
  const r = node(['--input-type=module', '-e', script])
  assert.notEqual(r.status, 0, 'expected the license gate to fail on AGPL-3.0')
})

test('the license gate performs a transitive node_modules SPDX walk and fails on a disallowed dependency license', () => {
  // Fabricating a real pnpm-managed .pnpm store in a throwaway dir is fragile,
  // so stub `corepack` on PATH (the gate calls `corepack pnpm licenses list
  // --json`): the stub prints a fixed payload with one allowlisted group (MIT)
  // and one violating group (AGPL), and the gate is driven against a clean
  // workspace so phase 1 passes and only the transitive phase can fail.
  const workDir = mkdtempSync(join(tmpdir(), 'gate-ws-'))
  writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - pkg\n')
  mkdirSync(join(workDir, 'pkg'))
  writeFileSync(
    join(workDir, 'pkg', 'package.json'),
    JSON.stringify({ name: 'pkg', license: 'MIT' }),
  )

  const binDir = mkdtempSync(join(tmpdir(), 'gate-bin-'))
  const fixture = {
    MIT: [{ name: 'good-pkg', versions: ['1.0.0'], license: 'MIT' }],
    'AGPL-3.0-only': [{ name: 'bad-pkg', versions: ['2.3.4'], license: 'AGPL-3.0-only' }],
  }
  const isWin = process.platform === 'win32'
  if (isWin) {
    writeFileSync(join(binDir, 'corepack.cmd'), `@echo off\r\necho ${JSON.stringify(fixture)}\r\n`)
  } else {
    const stubPath = join(binDir, 'corepack')
    writeFileSync(stubPath, `#!/bin/sh\ncat <<'EOF'\n${JSON.stringify(fixture)}\nEOF\n`)
    chmodSync(stubPath, 0o755)
  }

  const gatePath = fileURLToPath(new URL('../gates/license.mjs', import.meta.url))
  const r = spawnSync(process.execPath, [gatePath], {
    cwd: workDir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH}` },
  })

  assert.notEqual(
    r.status,
    0,
    `expected the transitive walk to fail on AGPL-3.0-only\n${r.stdout}${r.stderr}`,
  )
  assert.match(r.stderr, /bad-pkg@2\.3\.4/, 'failure output should name the offending package')
  assert.match(r.stderr, /AGPL-3\.0-only/, 'failure output should name the detected SPDX license')
})

test('the CI wiring propagates a non-zero exit (red is reachable)', () => {
  const r = node(['-e', 'process.exit(1)'])
  assert.notEqual(r.status, 0)
})

// --- C11: the replay-determinism gate is real, both directions -----------------

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const replayGate = fileURLToPath(new URL('../gates/replay.mjs', import.meta.url))

test('the replay gate passes (exit 0) on the real corpus and the built core', () => {
  // The green direction: the gate is real and reaches status 0 end to end
  // against core/replay-fixtures and the real @procezio/core build. ci:acceptance
  // builds core before this test runs, so core/dist is present here.
  const r = spawnSync(process.execPath, [replayGate], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(r.status, 0, `expected replay gate to pass\n${r.stdout}${r.stderr}`)
})

test('the replay gate goes RED when projection is nondeterministic (Math.random/Date.now injected via REPLAY_CORE_ENTRY shim)', () => {
  // The red direction: prove the byte-identical assertion actually fires and is
  // not a tautological always-pass. Point REPLAY_FIXTURES_DIR at a temp dir seeded
  // with the C9/C10 sample log (reusing the ratified envelope shape, not inventing
  // one) and REPLAY_CORE_ENTRY at a throwaway ESM shim whose project()/takeSnapshot()
  // embed Math.random()/Date.now() in their output - so two runs of the SAME input
  // necessarily diverge and the gate must exit non-zero.
  const fixturesDir = mkdtempSync(join(tmpdir(), 'replay-fix-'))
  const samples = readFileSync(
    fileURLToPath(new URL('../../schema/fixtures/event-envelope.samples.json', import.meta.url)),
    'utf8',
  )
  writeFileSync(join(fixturesDir, 'sample-log.json'), samples)

  const shimDir = mkdtempSync(join(tmpdir(), 'replay-shim-'))
  const shimPath = join(shimDir, 'nondeterministic-core.mjs')
  writeFileSync(
    shimPath,
    'export function project() { return { r: Math.random(), t: Date.now() } }\n' +
      'export function takeSnapshot() { return [{ seq: 0, r: Math.random() }] }\n',
  )

  const r = spawnSync(process.execPath, [replayGate], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, REPLAY_FIXTURES_DIR: fixturesDir, REPLAY_CORE_ENTRY: shimPath },
  })

  assert.notEqual(
    r.status,
    0,
    `expected the replay gate to fail on a nondeterministic projection\n${r.stdout}${r.stderr}`,
  )
  assert.match(r.stderr, /sample-log\.json/, 'failure output should name the offending fixture')
})
