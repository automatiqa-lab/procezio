// ci:validators-drift - the precompiled validators are downstream of the schema,
// exactly like the generated types (see scripts/gates/schema-drift.mjs). This gate
// regenerates schema/src/validators.cjs + schema/src/validators.d.ts from
// schema/canvas.schema.json using ajv's STANDALONE code generator and fails if the
// committed files differ. Drift between the ratified schema and the precompiled
// validators every consumer imports is CI-red, by design.
//
//   node scripts/gates/validators-drift.mjs           -> check mode (fail on drift)
//   node scripts/gates/validators-drift.mjs --write    -> regenerate + write (gen:validators)
//
// Why standalone, and why this matters (specs/02b C5, AGENTS.md): the Solo bundle
// runs under a strict CSP (`script-src 'self'`, no 'unsafe-eval'). ajv's normal
// runtime path compiles each schema with `new Function`, which a strict CSP blanks -
// so the event store cannot construct ajv at runtime in the browser. Standalone mode
// emits the validator as ordinary source ahead of time: the generated module contains
// ZERO eval / new Function and runs untouched under the CSP. This gate proves the
// committed, shipped validator is exactly what the pinned ajv (8.17.1) + the current
// schema produce - nothing hand-edited, nothing stale.
//
// The artifact is CommonJS (.cjs), not pure ESM: ajv's standalone emitter hardcodes
// `require("ajv/dist/runtime/ucs2length")` and `require("ajv-formats/dist/formats")`
// even under esm:true, so a `.cjs` is the honest, transform-free shape. It imports
// into ESM (core/app) via Node's named-export CJS interop and is bundled for the
// browser by Vite, with both requires resolved at build time. The acceptance criterion
// allows "validators.js or similar"; this is the de-risked "similar".
//
// Determinism: ajv is pinned exactly and output is normalized to LF before
// compare/write, so the diff cannot go spuriously red on line endings between a
// Windows dev box and Ubuntu CI. Path resolution is relative to THIS file, not cwd,
// so it behaves identically from the repo root (CI) or the schema dir (gen:validators).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const schemaPath = join(repoRoot, 'schema/canvas.schema.json')
const cjsPath = join(repoRoot, 'schema/src/validators.cjs')
const dtsPath = join(repoRoot, 'schema/src/validators.d.ts')
const write = process.argv.includes('--write')

// ajv + ajv-formats are dependencies of the schema package (they are runtime deps of
// the shipped validators), so resolve them from there - scripts/ has no node_modules.
const require = createRequire(join(repoRoot, 'schema/package.json'))

// The two exported validator names and the schema keys they compile from. Order is
// significant: it fixes the order of the `exports.*` lines in the generated .cjs, so
// the byte-compare is stable. validateCanvas = the root document; validateEventEnvelope
// = the envelope $def the event store validates every candidate against.
const CJS_BANNER = [
  '// DO NOT EDIT BY HAND.',
  '// Generated from schema/canvas.schema.json by `corepack pnpm --filter @procezio/schema gen:validators`',
  '// (ajv standalone). CSP-safe: contains ZERO eval / new Function, so it runs under the',
  '// Solo bundle strict CSP. CI job ci:validators-drift fails if this file drifts.',
].join('\n')

const DTS_BANNER = [
  '/**',
  ' * DO NOT EDIT BY HAND.',
  ' * Generated from schema/canvas.schema.json by `corepack pnpm --filter @procezio/schema gen:validators`.',
  ' * Type surface for the precompiled ajv standalone validators in ./validators.cjs.',
  ' * CI job ci:validators-drift fails if this file drifts.',
  ' */',
  "import type { ValidateFunction } from 'ajv'",
  "import type { Canvas, EventEnvelope } from './canvas.types'",
  '',
  '/** Precompiled validator for the root Canvas document (schema/canvas.schema.json). */',
  'export declare const validateCanvas: ValidateFunction<Canvas>',
  '',
  '/** Precompiled validator for the EventEnvelope contract (#/$defs/EventEnvelope). */',
  'export declare const validateEventEnvelope: ValidateFunction<EventEnvelope>',
  '',
].join('\n')

function generate() {
  const Ajv2020 = require('ajv/dist/2020.js').default
  const addFormats = require('ajv-formats').default ?? require('ajv-formats')
  const standaloneCode = require('ajv/dist/standalone').default
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))

  // Same ajv configuration the schema package's own tests and the C8 store used
  // (Ajv2020 + formats, allErrors, strict), so the precompiled validators enforce
  // the identical contract with identical error output. `code.source` turns on the
  // standalone emitter.
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    code: { source: true, esm: false },
  })
  addFormats(ajv)
  ajv.addSchema(schema)

  const code = standaloneCode(ajv, {
    validateCanvas: schema.$id,
    validateEventEnvelope: `${schema.$id}#/$defs/EventEnvelope`,
  })

  // Normalize to LF unconditionally - the repo is LF (.gitattributes) and the
  // committed files are LF, so the compare must be on LF regardless of platform.
  const cjs = `${CJS_BANNER}\n${code}`.replace(/\r\n/g, '\n')
  const dts = DTS_BANNER.replace(/\r\n/g, '\n')
  return { cjs, dts }
}

const { cjs, dts } = generate()

if (write) {
  writeFileSync(cjsPath, cjs)
  writeFileSync(dtsPath, dts)
  console.log(`validators-drift: WROTE ${cjsPath} (${cjs.length} bytes)`)
  console.log(`validators-drift: WROTE ${dtsPath} (${dts.length} bytes)`)
  process.exit(0)
}

function checkOne(label, path, generated) {
  if (!existsSync(path)) {
    console.error('validators-drift: FAIL - committed validator artifact missing')
    console.error(
      `  expected ${path}; run \`corepack pnpm --filter @procezio/schema gen:validators\``,
    )
    return false
  }
  const committed = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  if (committed === generated) return true

  console.error(`validators-drift: FAIL - generated ${label} differs from committed`)
  console.error('  the schema changed but the committed validators were not regenerated')
  console.error(
    '  run `corepack pnpm --filter @procezio/schema gen:validators` and commit the result',
  )
  const a = committed.split('\n')
  const b = generated.split('\n')
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      console.error(`  first diff at line ${i + 1}:`)
      console.error(`    committed: ${JSON.stringify((a[i] ?? '').slice(0, 200))}`)
      console.error(`    generated: ${JSON.stringify((b[i] ?? '').slice(0, 200))}`)
      break
    }
  }
  return false
}

const okCjs = checkOne('validators.cjs', cjsPath, cjs)
const okDts = checkOne('validators.d.ts', dtsPath, dts)

if (!okCjs || !okDts) process.exit(1)

console.log(
  `validators-drift: PASS - validators.cjs (${cjs.length} bytes) + validators.d.ts (${dts.length} bytes) match schema`,
)
process.exit(0)
