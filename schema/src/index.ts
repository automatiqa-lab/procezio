// @procezio/schema - the single contract: canvas ontology, event payloads, LLM
// output shapes. canvas.schema.json is the ratified source of truth; canvas.types.ts
// is generated from it (pnpm --filter @procezio/schema gen) and the ci:schema-drift
// gate fails on drift. Consumers in /core and /app import types from here only.
export type * from './canvas.types'

// Precompiled ajv STANDALONE validators, generated from canvas.schema.json by
// `corepack pnpm --filter @procezio/schema gen:validators` (ci:validators-drift fails
// on drift). These are the ONLY runtime values this package exports: the C8 event store
// imports validateEventEnvelope instead of constructing ajv at runtime, so the Solo
// bundle validates under a strict CSP (`script-src 'self'`, no 'unsafe-eval') - the
// generated module contains zero eval / new Function. The .cjs is resolved at runtime
// via this package's import/default export condition; its type surface is validators.d.ts.
export { validateCanvas, validateEventEnvelope } from './validators.js'
