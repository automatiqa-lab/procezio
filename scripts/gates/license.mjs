// ci:license - workspace + transitive license gate (C1 + C3).
// Phase 1: every workspace package declares an allowlisted license.
// Phase 2: every resolved node_modules dependency (via `pnpm licenses list
// --json`) declares an allowlisted SPDX license. Same allowlist, single
// source of truth, for both phases.
// Exit 0 = pass, non-zero = a package is missing/using a disallowed license.

import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const ALLOW = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'PostgreSQL',
  'Unlicense',
])

const bad = []

// --- Phase 1: workspace packages (C1 light check) ---------------------

// Workspace package dirs from pnpm-workspace.yaml (+ repo root).
const ws = readFileSync('pnpm-workspace.yaml', 'utf8')
const dirs = ['.']
for (const line of ws.split('\n')) {
  const m = line.match(/^\s*-\s+['"]?([^'"\s#]+)/)
  if (m) dirs.push(m[1].replace(/\/\*+$/, ''))
}

for (const dir of dirs) {
  const pkgPath = `${dir}/package.json`
  if (!existsSync(pkgPath)) continue
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const lic = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type
  if (!lic) bad.push(`${pkgPath}: no license field`)
  else if (!ALLOW.has(lic)) bad.push(`${pkgPath}: '${lic}' not in allowlist`)
}

// --- Phase 2: transitive node_modules SPDX walk (C3) -------------------

function isAllowed(licenseKey) {
  if (!licenseKey || licenseKey === 'Unknown') return false
  const alternatives = licenseKey
    .replace(/^\(/, '')
    .replace(/\)$/, '')
    .split(/\s+OR\s+/i)
    .map((s) => s.trim())
  return alternatives.some((alt) => ALLOW.has(alt))
}

// Scoped to PRODUCTION dependencies (--prod): the allowlist governs what ships
// to the user's browser in the Solo bundle, per constitution point 3 ("no
// non-OSI SDKs" in the product). Build-time devDependencies (vite, esbuild, and
// their data packages like caniuse-lite / CC-BY-4.0) are not distributed and are
// out of scope here. Runtime deps that get bundled ARE checked, strictly.
//
// Invoke pnpm through corepack so the walk runs wherever corepack exists
// (bundled with Node), not only where a global `pnpm` is on PATH. Passed as a
// single fixed command string (no interpolation) so shell:true carries no
// injection surface and no DEP0190 args-with-shell warning.
const pnpmResult = spawnSync('corepack pnpm licenses list --prod --json', {
  shell: true,
  encoding: 'utf8',
  cwd: process.cwd(),
})

// The transitive walk is fail-closed: any tooling failure (spawn error,
// non-zero exit, unparseable JSON) is a hard FAIL, not a skip/PASS. The
// license gate cannot be waived by a broken pipe - constitution point 3
// (no AGPL / no non-OSI SDKs) must be provably enforced, never assumed.
let transitiveChecked = 0

if (pnpmResult.error || pnpmResult.status !== 0) {
  bad.push(
    `transitive walk: corepack pnpm licenses list --json failed (${pnpmResult.error?.message || pnpmResult.stderr?.trim() || `exit ${pnpmResult.status}`})`,
  )
} else {
  let licenses
  try {
    licenses = JSON.parse(pnpmResult.stdout)
  } catch (e) {
    bad.push(`transitive walk: could not parse pnpm licenses list --json output (${e.message})`)
  }
  if (licenses) {
    for (const [licenseKey, pkgs] of Object.entries(licenses)) {
      if (isAllowed(licenseKey)) {
        for (const p of pkgs) transitiveChecked += p.versions?.length || 1
        continue
      }
      for (const p of pkgs) {
        const versions = Array.isArray(p.versions) && p.versions.length ? p.versions : ['unknown']
        for (const v of versions) {
          bad.push(`${p.name}@${v}: ${p.license || licenseKey}`)
          transitiveChecked++
        }
      }
    }
  }
}

if (bad.length) {
  console.error('license: FAIL')
  for (const b of bad) console.error('  - ' + b)
  process.exit(1)
}

console.log(
  `license: PASS (${dirs.length} workspace packages + ${transitiveChecked} transitive deps, allowlist ${[...ALLOW].join('/')})`,
)
