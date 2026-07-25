// ci:fixtures - the rule-engine fixtures gate (C13). Real implementation.
//
// This gate is the acceptance test for the starter ruleset. It drives the REAL
// C12 engine (evaluate() from @procezio/core) over every fixture and asserts that
// the set of rule ids that fired equals the fixture's declared `expected` set. Any
// mismatch turns the gate red (non-zero exit); it exits 0 only when every fixture
// matches. That is the whole determinism contract: given a projection + a
// triggering event, a versioned ruleset fires an exact, reproducible set of rules.
//
// Layering (AGENTS.md): the gate decides pass/fail from a computed set comparison,
// never a generative judgement. It reads @procezio/core's own exports and adds no
// new dependency - Node built-ins only (fs, path, url, module, child_process),
// plus js-yaml which is already a dev dependency of @procezio/core. The ruleset is
// DATA: it is parsed with js-yaml and validated against the C12 RULESET_JSON_SCHEMA
// (ajv) before a single fixture runs, so a malformed rule fails fast and loud.
//
// Build order: like replay.mjs, if core/dist is missing the gate builds
// @procezio/core first (corepack is the only route to pnpm here), so it runs
// standalone locally and before the build step inside ci:all.
//
// Overrides (for a red-path self-test, never normal CI):
//   FIXTURES_RULESET   - alternate ruleset.yaml path
//   FIXTURES_DIR       - alternate fixtures directory
//   FIXTURES_CORE_ENTRY- alternate module exporting evaluate()/createRuleValidator()

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const RULESET_PATH = process.env.FIXTURES_RULESET ?? 'rulesets/ruleset.yaml'
const FIXTURES_DIR = process.env.FIXTURES_DIR ?? 'rulesets/fixtures'
const DEFAULT_CORE_ENTRY = 'core/dist/index.js'
const coreEntryOverride = process.env.FIXTURES_CORE_ENTRY
const coreEntry = coreEntryOverride ?? DEFAULT_CORE_ENTRY

const fail = (msg) => {
  console.error(`fixtures: FAIL - ${msg}`)
  process.exit(1)
}

if (!existsSync(RULESET_PATH)) {
  fail(`ruleset not found: ${RULESET_PATH}`)
}
if (!existsSync(FIXTURES_DIR)) {
  fail(`fixtures directory not found: ${FIXTURES_DIR}`)
}

// Build @procezio/core if its default build output is missing, so the gate runs
// standalone. corepack is the only route to pnpm in this repo (AGENTS.md); passed
// as one fixed command string so shell:true carries no interpolation surface. When
// the caller overrides FIXTURES_CORE_ENTRY, the entry is used as-is and never built.
if (!coreEntryOverride && !existsSync(coreEntry)) {
  console.log('fixtures: core/dist missing - building @procezio/core via corepack pnpm ...')
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

// js-yaml is a dev dependency of @procezio/core, so resolve it through core's
// package (createRequire off core/package.json) rather than the repo root, which
// has no node_modules. Same createRequire route the C12 test uses for the parser.
const requireFromCore = createRequire(pathToFileURL(resolve('core/package.json')).href)
let yaml
try {
  yaml = requireFromCore('js-yaml')
} catch (e) {
  fail(`could not load js-yaml via @procezio/core (${e.message})`)
}

const { evaluate, createRuleValidator } = await import(pathToFileURL(resolve(coreEntry)).href)
if (typeof evaluate !== 'function' || typeof createRuleValidator !== 'function') {
  fail(`core entry ${coreEntry} does not export evaluate()/createRuleValidator()`)
}

// --- Load + validate the ruleset (DATA, never code) ---------------------------

let ruleset
try {
  ruleset = yaml.load(readFileSync(RULESET_PATH, 'utf8'))
} catch (e) {
  fail(`${RULESET_PATH}: not valid YAML (${e.message})`)
}

const validate = createRuleValidator()
if (!validate(ruleset)) {
  fail(
    `${RULESET_PATH}: does not validate against RULESET_JSON_SCHEMA - ${JSON.stringify(validate.errors)}`,
  )
}
console.log(
  `fixtures: ruleset ${RULESET_PATH} valid (${ruleset.rules.length} rules, version ${ruleset.version})`,
)

// --- Deterministic evaluate() context -----------------------------------------
//
// Identity (event_id) and the clock (ts) are caller-supplied, never invented by
// the engine, so a fixture always evaluates to the same candidates. The eventId
// factory depends only on the fired-rule index, keeping the run reproducible.
const makeContext = () => ({
  sessionId: 'aaaaaaaa-0000-4000-8000-00000000000a',
  correlationId: 'bbbbbbbb-0000-4000-8000-00000000000b',
  schemaVersion: '1.0',
  agentId: 'fixtures-gate',
  eventId: (_rule, index) => `abcdef00-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
  ts: '2026-07-06T10:00:00Z',
})

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x))
const sorted = (set) => [...set].sort()

// --- Run every fixture ---------------------------------------------------------

const files = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

if (files.length === 0) {
  fail(`no fixtures (*.json) found in ${FIXTURES_DIR}`)
}

for (const file of files) {
  const path = join(FIXTURES_DIR, file)
  let fixture
  try {
    fixture = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    fail(`${file}: not valid JSON (${e.message})`)
  }

  const { projection, event, expected } = fixture
  if (projection === undefined || event === undefined || !Array.isArray(expected)) {
    fail(`${file}: fixture must have shape { projection, event, expected: string[] }`)
  }

  const fired = evaluate(ruleset, projection, event, makeContext())
  const actualSet = new Set(fired.map((candidate) => candidate.payload.rule_id))
  const expectedSet = new Set(expected)

  if (!sameSet(actualSet, expectedSet)) {
    fail(
      `${file}: fired rule-id set mismatch on event '${event.type}' - ` +
        `expected [${sorted(expectedSet).join(', ')}], got [${sorted(actualSet).join(', ')}]`,
    )
  }

  const label = expectedSet.size === 0 ? 'SILENCE' : `fires [${sorted(expectedSet).join(', ')}]`
  console.log(`fixtures: OK ${file} (${event.type} -> ${label})`)
}

console.log(
  `fixtures: PASS (${files.length} fixtures match their expected rule-id sets, entry ${coreEntry})`,
)
