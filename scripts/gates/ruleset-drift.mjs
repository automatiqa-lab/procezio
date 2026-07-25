// ci:ruleset-drift - keep rulesets/ruleset.json in lockstep with ruleset.yaml.
//
// The ruleset is a crown-jewel methodology artifact authored in YAML (ruleset.yaml).
// The browser cannot parse YAML under the strict Solo CSP without a runtime parser, so
// the app imports a GENERATED JSON form (rulesets/ruleset.json) exactly as it imports
// the generated canvas types/validators. This gate mirrors schema-drift: it parses the
// YAML with js-yaml (a dev dependency of @procezio/core), validates it against the C12
// RULESET_JSON_SCHEMA, and:
//   - default:   fails if ruleset.json is missing or differs from the YAML (drift).
//   - --write:   regenerates ruleset.json from the YAML (the `gen` path).
//
// The JSON is DATA, byte-for-byte derivable from the YAML, so a human never edits it by
// hand - CI fails if they do. No eval, no network; deterministic 2-space JSON + newline.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const WRITE = process.argv.includes('--write')
const YAML_PATH = process.env.RULESET_YAML ?? 'rulesets/ruleset.yaml'
const JSON_PATH = process.env.RULESET_JSON ?? 'rulesets/ruleset.json'
// The app imports a generated TS module (kept inside its package, so no JSON-module /
// rootDir friction and no runtime YAML parse under the strict Solo CSP).
const TS_PATH = process.env.RULESET_TS ?? 'app/src/rules/ruleset.generated.ts'
const coreEntry = 'core/dist/index.js'

const fail = (msg) => {
  console.error(`ruleset-drift: ${msg}`)
  process.exit(1)
}

if (!existsSync(YAML_PATH)) fail(`ruleset YAML not found: ${YAML_PATH}`)

// Build @procezio/core if its dist entry is missing (createRuleValidator lives there).
if (!existsSync(coreEntry)) {
  const b = spawnSync(
    process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
    ['pnpm', '--filter', '@procezio/core', 'run', 'build'],
    { stdio: 'inherit' },
  )
  if (b.status !== 0 || !existsSync(coreEntry)) fail('could not build @procezio/core')
}

const requireFromCore = createRequire(pathToFileURL(resolve('core/package.json')).href)
let yaml
try {
  yaml = requireFromCore('js-yaml')
} catch (e) {
  fail(`could not load js-yaml via @procezio/core (${e.message})`)
}

const { createRuleValidator } = await import(pathToFileURL(resolve(coreEntry)).href)
if (typeof createRuleValidator !== 'function')
  fail(`core entry ${coreEntry} does not export createRuleValidator()`)

let ruleset
try {
  ruleset = yaml.load(readFileSync(YAML_PATH, 'utf8'))
} catch (e) {
  fail(`${YAML_PATH}: not valid YAML (${e.message})`)
}

const validate = createRuleValidator()
if (!validate(ruleset)) {
  fail(
    `${YAML_PATH}: does not validate against RULESET_JSON_SCHEMA - ${JSON.stringify(validate.errors)}`,
  )
}

// Canonical serialization: 2-space JSON + trailing newline (matches the repo style).
const canonicalJson = JSON.stringify(ruleset, null, 2) + '\n'

// The generated TS module: the same object inlined behind a Ruleset type, so the app
// gets it type-checked with no JSON-module resolution. The body reuses the canonical
// JSON verbatim (indented one level) so both artifacts stay byte-derivable from the YAML.
const tsBody = JSON.stringify(ruleset, null, 2)
const canonicalTs =
  `// GENERATED from rulesets/ruleset.yaml by ci:ruleset-drift. Do not edit by hand -\n` +
  `// CI fails on drift. Regenerate with: corepack pnpm --filter @procezio/schema run gen:ruleset\n` +
  `import type { Ruleset } from '@procezio/core'\n\n` +
  `export const RULESET: Ruleset = ${tsBody}\n`

const artifacts = [
  { path: JSON_PATH, content: canonicalJson },
  { path: TS_PATH, content: canonicalTs },
]

if (WRITE) {
  for (const { path, content } of artifacts) writeFileSync(path, content)
  console.log(
    `ruleset-drift: WROTE ${JSON_PATH} + ${TS_PATH} (${ruleset.rules.length} rules, version ${ruleset.version})`,
  )
  process.exit(0)
}

for (const { path, content } of artifacts) {
  if (!existsSync(path))
    fail(
      `${path} is missing - regenerate with the gen:ruleset script (--write); never edit it by hand.`,
    )
  if (readFileSync(path, 'utf8') !== content) {
    fail(
      `${path} is out of sync with ${YAML_PATH}. Regenerate with --write; never edit the generated file by hand.`,
    )
  }
}
console.log(
  `ruleset-drift: ${JSON_PATH} + ${TS_PATH} in sync with ${YAML_PATH} (${ruleset.rules.length} rules)`,
)
