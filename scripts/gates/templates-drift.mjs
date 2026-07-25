// ci:templates-drift - keep the generated templates module in lockstep with the canonical
// templates/*.json.
//
// Templates are a crown-jewel, publishable artifact (spec 01b section 13, H1): the starting
// process for a common flow. They are authored as canonical JSON at the repo root (so the
// community registry and other tools can read them), and the app imports a GENERATED, typed TS
// module - no cross-package JSON import, no runtime parse under the strict CSP - exactly as the
// prompt pack and ruleset do.
//
//   - default:  fails if the generated TS is missing or drifts from the JSON.
//   - --write:  regenerates the TS from the JSON (the gen:templates path).
//
// Validation is structural: every template needs an id/name/frame, five-shape nodes with a lane
// and a label, and every edge/tag/friction pinned to a declared node. The Diverge/Converge zones
// must stay empty (a template seeds Understand only), so any opportunities/scores are rejected.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const WRITE = process.argv.includes('--write')
const DIR = process.env.TEMPLATES_DIR ?? 'templates'
const TS_PATH = process.env.TEMPLATES_TS ?? 'app/src/templates/templates.generated.ts'

const NODE_TYPES = new Set(['Start', 'Step', 'Decision', 'Wait', 'End'])
const DATA_TAGS = new Set(['structured', 'semi-structured', 'unstructured'])
const RULES_TAGS = new Set(['explicit', 'mixed', 'judgment'])
const EXC_TAGS = new Set(['rare', 'occasional', 'frequent'])
const DOWNTIME = new Set([
  'Defects',
  'Overproduction',
  'Waiting',
  'Non-utilized-talent',
  'Transportation',
  'Inventory',
  'Motion',
  'Extra-processing',
])

const fail = (msg) => {
  console.error(`templates-drift: ${msg}`)
  process.exit(1)
}

if (!existsSync(DIR)) fail(`templates directory not found: ${DIR}`)

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
if (files.length === 0) fail(`no templates in ${DIR}`)

const templates = []
for (const file of files) {
  const path = join(DIR, file)
  let t
  try {
    t = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    fail(`${path}: not valid JSON (${e.message})`)
  }
  if (typeof t.id !== 'string' || t.id.length === 0) fail(`${file}: needs an id`)
  if (typeof t.name !== 'string' || t.name.length === 0) fail(`${file}: needs a name`)
  if (typeof t.frame !== 'object' || t.frame === null || typeof t.frame.name !== 'string')
    fail(`${file}: needs a frame with a name`)
  if (t.opportunities || t.cases || t.scores)
    fail(`${file}: templates seed Understand only - Diverge/Converge must stay empty`)
  const ids = new Set()
  for (const n of t.nodes ?? []) {
    if (ids.has(n.id)) fail(`${file}: duplicate node id ${n.id}`)
    ids.add(n.id)
    if (!NODE_TYPES.has(n.type)) fail(`${file}: node ${n.id} has unknown type ${n.type}`)
    if (!n.lane || !n.label) fail(`${file}: node ${n.id} needs a lane and a label`)
  }
  for (const e of t.edges ?? []) {
    if (!ids.has(e.from) || !ids.has(e.to)) fail(`${file}: edge ${e.id} references an unknown node`)
  }
  for (const a of t.audit_tags ?? []) {
    if (!ids.has(a.node_id)) fail(`${file}: audit tag ${a.id} references an unknown node`)
    if (!DATA_TAGS.has(a.data) || !RULES_TAGS.has(a.rules) || !EXC_TAGS.has(a.exceptions))
      fail(`${file}: audit tag ${a.id} has an unknown enum value`)
  }
  for (const f of t.friction ?? []) {
    if (!ids.has(f.node_id)) fail(`${file}: friction ${f.id} references an unknown node`)
    if (!DOWNTIME.has(f.waste)) fail(`${file}: friction ${f.id} has an unknown waste ${f.waste}`)
  }
  templates.push(t)
}

const tsBody = JSON.stringify(templates, null, 2)
const canonicalTs =
  `// GENERATED from templates/*.json by ci:templates-drift. Do not edit by hand - CI fails on\n` +
  `// drift. Regenerate with: corepack pnpm --filter @procezio/schema run gen:templates\n` +
  `import type { Template } from './template.js'\n\n` +
  `export const TEMPLATES: Template[] = ${tsBody}\n`

if (WRITE) {
  writeFileSync(TS_PATH, canonicalTs)
  console.log(`templates-drift: WROTE ${TS_PATH} (${templates.length} templates)`)
  process.exit(0)
}
if (!existsSync(TS_PATH))
  fail(`${TS_PATH} is missing - regenerate with the gen:templates script (--write).`)
if (readFileSync(TS_PATH, 'utf8') !== canonicalTs)
  fail(`${TS_PATH} is out of sync with ${DIR}. Regenerate with --write; never edit it by hand.`)
console.log(`templates-drift: ${DIR} + ${TS_PATH} in sync (${templates.length} templates)`)
