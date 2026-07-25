// ci:schema-drift - the single TS codegen path is the schema (specs/02 section 5).
// This gate regenerates schema/src/canvas.types.ts from schema/canvas.schema.json
// and fails if the committed file differs. Drift between the ratified schema and
// the types every package imports is CI-red, by design: the schema is the
// contract, the generated types are downstream of it, never the other way round.
//
//   node scripts/gates/schema-drift.mjs           -> check mode (fail on drift)
//   node scripts/gates/schema-drift.mjs --write    -> regenerate + write (the `gen` script)
//
// Determinism (see ImplPlan riskiest assumption): json-schema-to-typescript is
// pinned exactly and its output is normalized to LF before compare/write, so the
// diff cannot go spuriously red on line endings between Windows dev and Ubuntu CI.
//
// Path resolution is relative to THIS file, not cwd, so it behaves identically
// whether invoked from the repo root (CI) or the schema package dir (pnpm run gen).
// Env overrides SCHEMA_DRIFT_SCHEMA / SCHEMA_DRIFT_TYPES exist for the gate's own
// red-path test.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const schemaPath = process.env.SCHEMA_DRIFT_SCHEMA || join(repoRoot, 'schema/canvas.schema.json')
const typesPath = process.env.SCHEMA_DRIFT_TYPES || join(repoRoot, 'schema/src/canvas.types.ts')
const write = process.argv.includes('--write')

// json-schema-to-typescript is a devDependency of the schema package, so resolve
// it from there (not from scripts/, which has no node_modules of its own).
const require = createRequire(join(repoRoot, 'schema/package.json'))

const BANNER = [
  '/**',
  ' * DO NOT EDIT BY HAND.',
  ' * Generated from schema/canvas.schema.json by `pnpm --filter @procezio/schema gen`',
  ' * (json-schema-to-typescript). The schema is the contract; these types are',
  ' * downstream of it. CI job ci:schema-drift fails if this file drifts.',
  ' */',
].join('\n')

async function generate() {
  const { compileFromFile } = require('json-schema-to-typescript')
  const out = await compileFromFile(schemaPath, {
    bannerComment: BANNER,
    additionalProperties: false,
    unreachableDefinitions: true,
    declareExternallyReferenced: true,
    cwd: join(repoRoot, 'schema'),
  })
  // Normalize to LF unconditionally - the repo is LF (.gitattributes) and the
  // committed file is LF, so the compare must be on LF regardless of platform.
  return out.replace(/\r\n/g, '\n')
}

const generated = await generate()

if (write) {
  writeFileSync(typesPath, generated)
  console.log(`schema-drift: WROTE ${typesPath} (${generated.length} bytes)`)
  process.exit(0)
}

if (!existsSync(typesPath)) {
  console.error('schema-drift: FAIL - committed types missing')
  console.error(`  expected ${typesPath}; run \`pnpm --filter @procezio/schema gen\``)
  process.exit(1)
}

const committed = readFileSync(typesPath, 'utf8').replace(/\r\n/g, '\n')

if (committed !== generated) {
  console.error('schema-drift: FAIL - generated types differ from committed types')
  console.error('  the schema changed but the committed types were not regenerated')
  console.error('  run `pnpm --filter @procezio/schema gen` and commit the result')
  // First differing line, to make the failure legible in CI logs.
  const a = committed.split('\n')
  const b = generated.split('\n')
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      console.error(`  first diff at line ${i + 1}:`)
      console.error(`    committed: ${JSON.stringify(a[i])}`)
      console.error(`    generated: ${JSON.stringify(b[i])}`)
      break
    }
  }
  process.exit(1)
}

console.log(`schema-drift: PASS - ${typesPath} matches schema (${generated.length} bytes)`)
process.exit(0)
