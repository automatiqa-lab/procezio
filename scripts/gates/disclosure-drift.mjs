// ci:disclosure-drift - keep app/src/disclosure/disclosure.generated.ts in lockstep with
// disclosure/disclosure.yaml.
//
// The disclosure config is a ratified artifact (CONTRIBUTING.md): it decides what the
// product says about AI-generated content under EU AI Act Art. 50, so it is authored in
// YAML and reviewed as a unit. The browser cannot parse YAML under the strict Solo CSP,
// so the app imports a GENERATED TS module, exactly as it does for the ruleset. This gate
// mirrors ruleset-drift:
//   - default:   fails if the generated module is missing or differs from the YAML.
//   - --write:   regenerates it (the `gen` path).
//
// It also enforces the two invariants that make the marking trustworthy, because a typo
// here would silently produce output that misstates provenance:
//   - `schema` and `system` match what core/src/disclosure.ts compiled in, so config and
//     code cannot drift apart.
//   - `wording.none` is empty. A canvas with nothing drafted must export no line at all.
//
// No eval, no network; deterministic 2-space output plus a trailing newline.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const WRITE = process.argv.includes('--write')
const YAML_PATH = process.env.DISCLOSURE_YAML ?? 'disclosure/disclosure.yaml'
const TS_PATH = process.env.DISCLOSURE_TS ?? 'app/src/disclosure/disclosure.generated.ts'

// Mirrored from core/src/disclosure.ts. Kept as literals so the gate stays runnable
// without a core build; the assertions below are what tie them together.
const EXPECTED_SCHEMA = 'automatiqa-disclosure/1'
const EXPECTED_SYSTEM = 'procezio'

const fail = (msg) => {
  console.error(`disclosure-drift: ${msg}`)
  process.exit(1)
}

if (!existsSync(YAML_PATH)) fail(`disclosure YAML not found: ${YAML_PATH}`)

const requireFromCore = createRequire(pathToFileURL(resolve('core/package.json')).href)
let yaml
try {
  yaml = requireFromCore('js-yaml')
} catch (e) {
  fail(`could not load js-yaml via @procezio/core (${e.message})`)
}

let config
try {
  config = yaml.load(readFileSync(YAML_PATH, 'utf8'))
} catch (e) {
  fail(`${YAML_PATH}: not valid YAML (${e.message})`)
}

// Shape and invariants.
if (typeof config !== 'object' || config === null) fail(`${YAML_PATH}: expected a mapping`)
if (typeof config.version !== 'number') fail(`${YAML_PATH}: version must be a number`)
if (config.schema !== EXPECTED_SCHEMA)
  fail(`${YAML_PATH}: schema is ${config.schema}, but the build speaks ${EXPECTED_SCHEMA}`)
if (config.system !== EXPECTED_SYSTEM)
  fail(`${YAML_PATH}: system is ${config.system}, but core/src/disclosure.ts says ${EXPECTED_SYSTEM}`)
if (typeof config.contact !== 'string' || !config.contact.includes('@'))
  fail(`${YAML_PATH}: contact must be an email address`)
if (!Array.isArray(config.scope) || config.scope.length === 0)
  fail(`${YAML_PATH}: scope must be a non-empty list`)

const w = config.wording
if (typeof w !== 'object' || w === null) fail(`${YAML_PATH}: wording must be a mapping`)
for (const key of ['session_notice', 'drafted', 'unreviewed', 'none']) {
  if (typeof w[key] !== 'string') fail(`${YAML_PATH}: wording.${key} must be a string`)
}
if (w.none !== '')
  fail(
    `${YAML_PATH}: wording.none must be empty - a canvas with nothing drafted exports no line at all.`,
  )
for (const key of ['drafted', 'unreviewed']) {
  if (!w[key].includes('{drafted}'))
    fail(`${YAML_PATH}: wording.${key} must interpolate {drafted}`)
}
if (!w.unreviewed.includes('{pending}'))
  fail(`${YAML_PATH}: wording.unreviewed must interpolate {pending}`)
// The model is never named in visible output - see the Art. 50 notes in COMPLIANCE.md.
for (const key of ['session_notice', 'drafted', 'unreviewed']) {
  if (/\{model\}/.test(w[key]))
    fail(`${YAML_PATH}: wording.${key} must not interpolate {model} - visible output never names it`)
}

const identity = {
  version: config.version,
  schema: config.schema,
  system: config.system,
  scope: config.scope,
  contact: config.contact,
}
const wording = {
  session_notice: w.session_notice,
  drafted: w.drafted,
  unreviewed: w.unreviewed,
  none: w.none,
}

const canonicalTs =
  `// GENERATED from disclosure/disclosure.yaml by ci:disclosure-drift. Do not edit by hand -\n` +
  `// CI fails on drift. Regenerate with: node scripts/gates/disclosure-drift.mjs --write\n` +
  `import type { DisclosureIdentity, DisclosureWording } from '@procezio/core'\n\n` +
  `export const DISCLOSURE: DisclosureIdentity = ${JSON.stringify(identity, null, 2)}\n\n` +
  `export const DISCLOSURE_WORDING: DisclosureWording = ${JSON.stringify(wording, null, 2)}\n`

if (WRITE) {
  mkdirSync(dirname(TS_PATH), { recursive: true })
  writeFileSync(TS_PATH, canonicalTs)
  console.log(`disclosure-drift: WROTE ${TS_PATH} (version ${config.version})`)
  process.exit(0)
}

if (!existsSync(TS_PATH))
  fail(`${TS_PATH} is missing - regenerate with --write; never edit it by hand.`)
if (readFileSync(TS_PATH, 'utf8') !== canonicalTs)
  fail(`${TS_PATH} is out of sync with ${YAML_PATH}. Regenerate with --write.`)

console.log(`disclosure-drift: ${TS_PATH} in sync with ${YAML_PATH} (version ${config.version})`)
