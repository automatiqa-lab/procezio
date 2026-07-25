// ci:prompt-pack-drift - keep the generated prompt-pack module in lockstep with the
// canonical prompt-packs/prompt-pack.json.
//
// The prompt pack is a crown-jewel methodology artifact (the constitution): the versioned
// prompts the agent uses. It is authored as canonical JSON and the app imports a
// GENERATED, typed TS module (kept inside the app package, so no cross-package JSON
// import and no runtime parsing under the strict CSP), exactly as the ruleset does.
//
//   - default:  fails if the generated TS is missing or drifts from the JSON.
//   - --write:  regenerates the TS from the JSON (the gen:prompt-pack path).
//
// Validation is structural (no external schema): a version string, and a prompts map
// whose every entry has non-empty system + user strings. The generated file is
// byte-derivable from the JSON, so CI fails if it is hand-edited.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const WRITE = process.argv.includes('--write')
const JSON_PATH = process.env.PROMPT_PACK_JSON ?? 'prompt-packs/prompt-pack.json'
const TS_PATH = process.env.PROMPT_PACK_TS ?? 'app/src/tasks/prompt-pack.generated.ts'

const fail = (msg) => {
  console.error(`prompt-pack-drift: ${msg}`)
  process.exit(1)
}

if (!existsSync(JSON_PATH)) fail(`prompt pack not found: ${JSON_PATH}`)

let pack
try {
  pack = JSON.parse(readFileSync(JSON_PATH, 'utf8'))
} catch (e) {
  fail(`${JSON_PATH}: not valid JSON (${e.message})`)
}

// Structural validation.
if (typeof pack !== 'object' || pack === null) fail('prompt pack must be an object')
if (typeof pack.version !== 'string' || pack.version.length === 0)
  fail('prompt pack needs a version string')
if (typeof pack.prompts !== 'object' || pack.prompts === null)
  fail('prompt pack needs a prompts map')
for (const [id, p] of Object.entries(pack.prompts)) {
  if (typeof p?.system !== 'string' || p.system.trim().length === 0)
    fail(`prompt "${id}" needs a non-empty system string`)
  if (typeof p?.user !== 'string' || p.user.trim().length === 0)
    fail(`prompt "${id}" needs a non-empty user string`)
}

const canonicalJson = JSON.stringify(pack, null, 2) + '\n'
const tsBody = JSON.stringify(pack, null, 2)
const canonicalTs =
  `// GENERATED from prompt-packs/prompt-pack.json by ci:prompt-pack-drift. Do not edit by\n` +
  `// hand - CI fails on drift. Regenerate with: corepack pnpm --filter @procezio/schema run gen:prompt-pack\n` +
  `import type { PromptPack } from './prompts.js'\n\n` +
  `export const PROMPT_PACK: PromptPack = ${tsBody}\n`

const artifacts = [
  { path: JSON_PATH, content: canonicalJson },
  { path: TS_PATH, content: canonicalTs },
]

if (WRITE) {
  for (const { path, content } of artifacts) writeFileSync(path, content)
  console.log(
    `prompt-pack-drift: WROTE ${JSON_PATH} + ${TS_PATH} (${Object.keys(pack.prompts).length} prompts, version ${pack.version})`,
  )
  process.exit(0)
}

for (const { path, content } of artifacts) {
  if (!existsSync(path))
    fail(
      `${path} is missing - regenerate with the gen:prompt-pack script (--write); never edit it by hand.`,
    )
  if (readFileSync(path, 'utf8') !== content) {
    fail(
      `${path} is out of sync with ${JSON_PATH}. Regenerate with --write; never edit the generated file by hand.`,
    )
  }
}
console.log(
  `prompt-pack-drift: ${JSON_PATH} + ${TS_PATH} in sync (${Object.keys(pack.prompts).length} prompts)`,
)
