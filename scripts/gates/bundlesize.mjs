// ci:bundlesize - the production bundle-size budget gate.
//
// A static-hosted Solo demo IS the product (specs/05), so the download weight is a
// user-facing feature, not an afterthought. This gate builds the real browser bundle and
// holds two gzipped budgets: the whole JS payload, and the single largest chunk. The
// largest-chunk budget is also the code-splitting tripwire - if a refactor collapsed the
// eight lazy zones or React Flow back into one chunk, that chunk would blow the ceiling and
// turn the gate red.
//
// Layering (AGENTS.md): pass/fail is a pure size comparison, exit code only, no judgement.
// Node built-ins only (fs, zlib, child_process) - no new dependency.
//
// Override: BUNDLESIZE_SKIP_BUILD=1 measures the existing app/dist without rebuilding
// (used by the gate self-test, and handy locally right after a build).

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

// Gzipped budgets, in kilobytes. The entry chunk carries the precompiled ajv validators, which
// grow with the ratified schema - Wave-1/Wave-2 added persona, template, checkpoint, decision-
// journal and simulated-perspective contracts, so the entry chunk legitimately climbed from ~75
// to ~95 KB. Export, demo and the template picker are already code-split out; what remains in the
// entry chunk (the store + its validators) cannot be split off. The v0.4 UX pass added the
// autosave safety net, the shell string dictionary (English-only) and the start-door chips -
// all needed at first paint - putting the entry chunk at ~104.5 KB. Card 3060 added the
// map-driven autopopulation dispatcher to the shell (it must watch every map edit, so it
// rides the entry deliberately), putting the entry chunk at ~107.7 KB. The max-chunk
// budget is 109 KB: enough headroom for small deliberate growth, tight enough that a real
// code-splitting regression still trips it. The env overrides exist for the red-path
// self-test.
const TOTAL_GZIP_BUDGET_KB = Number(process.env.BUNDLESIZE_TOTAL_KB ?? 260)
const MAX_CHUNK_GZIP_BUDGET_KB = Number(process.env.BUNDLESIZE_MAX_CHUNK_KB ?? 109)

const ASSETS_DIR = process.env.BUNDLESIZE_ASSETS_DIR ?? join('app', 'dist', 'assets')

function build() {
  const res = spawnSync('corepack', ['pnpm', '--filter', '@procezio/app', 'run', 'build'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (res.status !== 0) {
    console.error('ci:bundlesize: the production build failed.')
    process.exit(1)
  }
}

if (process.env.BUNDLESIZE_SKIP_BUILD !== '1') build()

if (!existsSync(ASSETS_DIR)) {
  console.error(`ci:bundlesize: no build output at ${ASSETS_DIR} (did the build run?).`)
  process.exit(1)
}

const jsFiles = readdirSync(ASSETS_DIR).filter((f) => f.endsWith('.js'))
if (jsFiles.length === 0) {
  console.error(`ci:bundlesize: no .js chunks found in ${ASSETS_DIR}.`)
  process.exit(1)
}

const chunks = jsFiles
  .map((name) => {
    const gzip = gzipSync(readFileSync(join(ASSETS_DIR, name))).length
    return { name, gzipKb: gzip / 1024 }
  })
  .sort((a, b) => b.gzipKb - a.gzipKb)

const totalKb = chunks.reduce((sum, c) => sum + c.gzipKb, 0)
const largest = chunks[0]

console.log('ci:bundlesize - gzipped JS chunks:')
for (const c of chunks) console.log(`  ${c.gzipKb.toFixed(1).padStart(7)} KB  ${c.name}`)
console.log(`  ${'-'.repeat(7)}`)
console.log(`  ${totalKb.toFixed(1).padStart(7)} KB  total (budget ${TOTAL_GZIP_BUDGET_KB} KB)`)
console.log(
  `  ${largest.gzipKb.toFixed(1).padStart(7)} KB  largest chunk (budget ${MAX_CHUNK_GZIP_BUDGET_KB} KB)`,
)

const failures = []
if (totalKb > TOTAL_GZIP_BUDGET_KB) {
  failures.push(`total JS ${totalKb.toFixed(1)} KB exceeds the ${TOTAL_GZIP_BUDGET_KB} KB budget`)
}
if (largest.gzipKb > MAX_CHUNK_GZIP_BUDGET_KB) {
  failures.push(
    `largest chunk ${largest.name} (${largest.gzipKb.toFixed(1)} KB) exceeds the ${MAX_CHUNK_GZIP_BUDGET_KB} KB budget - did code-splitting regress?`,
  )
}

if (failures.length > 0) {
  console.error('\nci:bundlesize FAILED:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log('\nci:bundlesize: within budget.')
