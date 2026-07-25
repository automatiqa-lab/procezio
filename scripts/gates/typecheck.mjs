// ci:typecheck - runs tsc against every workspace package's tsconfig.
// Invokes the TypeScript compiler through node directly (not via pnpm) so the
// gate is robust wherever node + an installed dependency tree exist, without
// depending on pnpm being on PATH.

import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const ws = readFileSync('pnpm-workspace.yaml', 'utf8')
const dirs = []
for (const line of ws.split('\n')) {
  const m = line.match(/^\s*-\s+['"]?([^'"\s#]+)/)
  if (m) dirs.push(m[1].replace(/\/\*+$/, ''))
}

const tsc = 'node_modules/typescript/bin/tsc'
if (!existsSync(tsc)) {
  console.error('typecheck: typescript not installed - run install first')
  process.exit(1)
}

let failed = 0
for (const dir of dirs) {
  if (!existsSync(`${dir}/tsconfig.json`)) continue
  const r = spawnSync(process.execPath, [tsc, '-p', `${dir}/tsconfig.json`], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`typecheck: FAIL in ${dir}`)
    failed++
  }
}

if (failed) process.exit(1)
console.log(`typecheck: PASS (${dirs.length} packages)`)
