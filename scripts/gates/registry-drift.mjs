// ci:registry-drift - keep the community registry indexes honest (spec 01b section 13, H2).
//
// The registry is three JSON indexes (templates/personas/rulesets) that describe the packs Procez
// can load, and the contribution surface (PR = contribution). This gate keeps the indexes from
// drifting from what actually ships:
//   - every index is well-formed: a kind, a version, and entries each with an id + name + license.
//   - templates.json lists EXACTLY the shipped templates/*.json (no orphan entry advertising a
//     template that does not exist, and no shipped template missing from the index).
//   - every built-in entry's `path` points at a file that exists.
// This is a validation-only gate (no generated artifact), so there is no --write mode.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.REGISTRY_DIR ?? 'registry'
const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? 'templates'

const fail = (msg) => {
  console.error(`registry-drift: ${msg}`)
  process.exit(1)
}

const readJson = (path) => {
  if (!existsSync(path)) fail(`missing ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    fail(`${path}: not valid JSON (${e.message})`)
  }
}

const KINDS = ['templates', 'personas', 'rulesets']
for (const kind of KINDS) {
  const idx = readJson(join(DIR, `${kind}.json`))
  if (idx.kind !== kind) fail(`${kind}.json: kind must be "${kind}"`)
  if (typeof idx.version !== 'string' || idx.version.length === 0)
    fail(`${kind}.json: needs a version string`)
  if (!Array.isArray(idx.entries) || idx.entries.length === 0)
    fail(`${kind}.json: needs a non-empty entries array`)
  const seen = new Set()
  for (const e of idx.entries) {
    if (typeof e.id !== 'string' || e.id.length === 0) fail(`${kind}.json: an entry has no id`)
    if (seen.has(e.id)) fail(`${kind}.json: duplicate entry id ${e.id}`)
    seen.add(e.id)
    if (typeof e.name !== 'string' || e.name.length === 0)
      fail(`${kind}.json: entry ${e.id} has no name`)
    if (typeof e.license !== 'string' || e.license.length === 0)
      fail(`${kind}.json: entry ${e.id} has no license`)
    if (e.path && !existsSync(e.path)) fail(`${kind}.json: entry ${e.id} path ${e.path} not found`)
    if (e.pack && !existsSync(e.pack)) fail(`${kind}.json: entry ${e.id} pack ${e.pack} not found`)
  }
}

// templates.json must match the shipped templates exactly.
const shipped = readdirSync(TEMPLATES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson(join(TEMPLATES_DIR, f)).id)
  .sort()
const indexed = readJson(join(DIR, 'templates.json'))
  .entries.map((e) => e.id)
  .sort()
if (JSON.stringify(shipped) !== JSON.stringify(indexed))
  fail(
    `templates.json is out of sync with ${TEMPLATES_DIR}/: shipped [${shipped}] vs indexed [${indexed}]`,
  )

console.log(
  `registry-drift: ${KINDS.length} indexes well-formed; templates index matches ${shipped.length} shipped templates`,
)
