// ci:replay - the replay-determinism gate (C11). Non-waivable.
//
// Re-projects every recorded event log in core/replay-fixtures/ TWICE through
// @procezio/core's project() and asserts the two projections are byte-identical
// (JSON.stringify equality), plus that takeSnapshot() yields an identical
// snapshot hash across the two runs. Any divergence - a wall clock, randomness,
// iteration-order or merge nondeterminism leaking into the projection path -
// turns this gate red. This is the determinism guarantee of specs/02 s.13 and
// specs/02b C3 (sessions pin ruleset_hash + prompt_pack_version + model_ref so a
// log always replays to the same state).
//
// Layering (AGENTS.md): the gate decides pass/fail from exit code alone; it makes
// no generative judgement. It reads @procezio/core's own exports and adds no new
// dependency (node built-ins only: fs, path, url, crypto, child_process).
//
// Overrides (used by the red-path self-test in scripts/ci/gate-selftest.test.mjs,
// never in normal CI): REPLAY_FIXTURES_DIR points the corpus elsewhere and
// REPLAY_CORE_ENTRY points project()/takeSnapshot() at an alternate module - the
// self-test aims both at a shim that injects Math.random()/Date.now() to prove
// the byte-identical assertion actually fires.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const FIXTURES_DIR = process.env.REPLAY_FIXTURES_DIR ?? 'core/replay-fixtures'
const DEFAULT_CORE_ENTRY = 'core/dist/index.js'
const coreEntryOverride = process.env.REPLAY_CORE_ENTRY
const coreEntry = coreEntryOverride ?? DEFAULT_CORE_ENTRY

const fail = (msg) => {
  console.error(`replay: FAIL - ${msg}`)
  process.exit(1)
}

// Build @procezio/core if the default build output is missing, so the gate runs
// standalone (locally, or before the build step in ci:all). corepack is the only
// route to pnpm in this repo (AGENTS.md); passed as a single fixed command string
// so shell:true carries no interpolation/injection surface. When the caller
// overrides REPLAY_CORE_ENTRY (the self-test), the entry is used as-is and never
// built - the override IS the module under test.
if (!coreEntryOverride && !existsSync(coreEntry)) {
  console.log('replay: core/dist missing - building @procezio/core via corepack pnpm ...')
  const build = spawnSync('corepack pnpm --filter @procezio/core run build', {
    shell: true,
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  if (build.error || build.status !== 0) {
    fail(`could not build @procezio/core (${build.error?.message || `exit ${build.status}`})`)
  }
}

if (!existsSync(coreEntry)) {
  fail(`core entry not found: ${coreEntry}`)
}
if (!existsSync(FIXTURES_DIR)) {
  fail(`fixtures directory not found: ${FIXTURES_DIR}`)
}

const { project, takeSnapshot } = await import(pathToFileURL(resolve(coreEntry)).href)
if (typeof project !== 'function' || typeof takeSnapshot !== 'function') {
  fail(`core entry ${coreEntry} does not export project()/takeSnapshot()`)
}

const files = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

if (files.length === 0) {
  fail(`no fixture logs (*.json) found in ${FIXTURES_DIR}`)
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

for (const file of files) {
  const path = join(FIXTURES_DIR, file)
  const raw = readFileSync(path, 'utf8')

  // Parse the SAME source text into two INDEPENDENT object graphs, so an
  // aliasing/shared-reference bug cannot hide behind "identical because it is
  // literally the same array". Two honest, separate runs of the same input.
  let runA
  let runB
  try {
    runA = JSON.parse(raw)
    runB = JSON.parse(raw)
  } catch (e) {
    fail(`${file}: not valid JSON (${e.message})`)
  }
  if (!Array.isArray(runA)) {
    fail(`${file}: fixture is not an EventEnvelope[] array`)
  }

  const stateA = JSON.stringify(project(runA))
  const stateB = JSON.stringify(project(runB))
  if (stateA !== stateB) {
    fail(`${file}: re-projected to DIFFERING state across two runs (nondeterministic projection)`)
  }

  const snapHashA = sha256(JSON.stringify(takeSnapshot(runA)))
  const snapHashB = sha256(JSON.stringify(takeSnapshot(runB)))
  if (snapHashA !== snapHashB) {
    fail(`${file}: snapshot hashes differ across two runs (${snapHashA} != ${snapHashB})`)
  }

  console.log(
    `replay: OK ${file} (state + snapshot byte-identical, snapshot sha256 ${snapHashA.slice(0, 12)})`,
  )
}

console.log(
  `replay: PASS (${files.length} fixture log${files.length === 1 ? '' : 's'} re-project deterministically, entry ${coreEntry})`,
)
