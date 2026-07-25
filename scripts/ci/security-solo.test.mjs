// C4 acceptance test: ci:security-solo enforces the Solo-mode threat model
// (specs/02b-architecture-v0.3-amendment.md#C5, specs/02-architecture-v0.1.md#12) -
// no eval of model output, no hardcoded non-endpoint egress, no API key written to a
// .pnav file - and reports the offending filename for each finding.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const gatePath = fileURLToPath(new URL('../gates/security-solo.mjs', import.meta.url))

function runGate(cwd) {
  return spawnSync(process.execPath, [gatePath], { cwd, encoding: 'utf8' })
}

// A strict, gate-passing Solo CSP: same-origin locked, no unsafe-eval.
const STRICT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.model-endpoint.placeholder; img-src 'self' data:; object-src 'none'; base-uri 'self'"

function writeIndexHtml(dir, csp) {
  const meta =
    csp === null ? '' : `    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n`
  writeFileSync(
    join(dir, 'app', 'index.html'),
    `<!doctype html>\n<html lang="en">\n  <head>\n${meta}    <title>t</title>\n  </head>\n  <body><div id="root"></div></body>\n</html>\n`,
  )
}

function freshWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'gate-security-solo-'))
  mkdirSync(join(dir, 'app', 'src'), { recursive: true })
  // A valid strict CSP by default so the source-focused tests below exercise only
  // their intended rule and the CSP rule (Rule 4) stays green for them.
  writeIndexHtml(dir, STRICT_CSP)
  return dir
}

test('ci:security-solo passes on the current clean codebase', () => {
  const r = spawnSync(process.execPath, [gatePath], { encoding: 'utf8' })
  assert.equal(r.status, 0, `expected pass, got ${r.status}\n${r.stdout}${r.stderr}`)
  assert.match(r.stdout, /security-solo: PASS/)
})

test('flags eval() of model output and names the file', () => {
  const dir = freshWorkspace()
  writeFileSync(
    join(dir, 'app', 'src', 'reply-handler.ts'),
    'const modelText = await callLLM();\nconst parsed = eval(modelText);\nexport { parsed };\n',
  )

  const r = runGate(dir)
  assert.notEqual(r.status, 0, 'expected the gate to fail on eval() of model output')
  assert.match(r.stderr, /eval-model-output/)
  assert.match(r.stderr, /reply-handler\.ts/, 'failure output should name the offending file')
})

test('flags a hardcoded non-endpoint fetch origin and names the file', () => {
  const dir = freshWorkspace()
  writeFileSync(
    join(dir, 'app', 'src', 'telemetry.ts'),
    "export async function ping() {\n  return fetch('https://telemetry.example.com/collect');\n}\n",
  )

  const r = runGate(dir)
  assert.notEqual(r.status, 0, 'expected the gate to fail on a hardcoded fetch origin')
  assert.match(r.stderr, /hardcoded-fetch-origin/)
  assert.match(r.stderr, /telemetry\.ts/, 'failure output should name the offending file')
})

test('flags an API key written to a .pnav file and names the file', () => {
  const dir = freshWorkspace()
  writeFileSync(
    join(dir, 'app', 'src', 'session-store.ts'),
    [
      'export function saveSession(session, apiKey) {',
      '  const payload = { events: session.events, apiKey };',
      "  writeFileSync(session.path + '.pnav', JSON.stringify(payload));",
      '}',
      '',
    ].join('\n'),
  )

  const r = runGate(dir)
  assert.notEqual(r.status, 0, 'expected the gate to fail on an API key written to a .pnav file')
  assert.match(r.stderr, /api-key-to-pnav/)
  assert.match(r.stderr, /session-store\.ts/, 'failure output should name the offending file')
})

test('a clean file with no violations keeps the gate green', () => {
  const dir = freshWorkspace()
  writeFileSync(
    join(dir, 'app', 'src', 'safe.ts'),
    'export function greet(name) {\n  return `hello ${name}`;\n}\n',
  )

  const r = runGate(dir)
  assert.equal(r.status, 0, `expected pass, got ${r.status}\n${r.stdout}${r.stderr}`)
})

// --- Rule 4 (CSP) red paths ----------------------------------------------------

test('fails when app/index.html has no CSP meta tag (csp-missing)', () => {
  const dir = freshWorkspace()
  writeIndexHtml(dir, null) // index.html present but carries no CSP

  const r = runGate(dir)
  assert.notEqual(r.status, 0, 'a missing CSP must fail the gate')
  assert.match(r.stderr, /csp-missing/)
  assert.match(r.stderr, /index\.html/, 'failure output should name app/index.html')
})

test("fails when the CSP is weakened with 'unsafe-eval' (csp-unsafe-eval)", () => {
  const dir = freshWorkspace()
  writeIndexHtml(dir, "default-src 'self'; script-src 'self' 'unsafe-eval'; connect-src 'self'")

  const r = runGate(dir)
  assert.notEqual(r.status, 0, "a CSP with 'unsafe-eval' must fail the gate")
  assert.match(r.stderr, /csp-unsafe-eval/)
  assert.match(r.stderr, /index\.html/, 'failure output should name app/index.html')
})

test('fails when connect-src is widened to a non-loopback origin (csp-connect-src)', () => {
  const dir = freshWorkspace()
  writeIndexHtml(
    dir,
    "default-src 'self'; connect-src 'self' https://api.example.com https://*.model-endpoint.placeholder",
  )
  const r = runGate(dir)
  assert.notEqual(r.status, 0, 'expected the gate to fail on a widened connect-src')
  assert.match(r.stderr, /csp-connect-src/)
  assert.match(r.stderr, /api\.example\.com/, 'failure output should name the offending origin')
})

test('the shipped loopback + placeholder connect-src entries stay green', () => {
  const dir = freshWorkspace()
  writeIndexHtml(
    dir,
    "default-src 'self'; connect-src 'self' http://localhost:11434 http://127.0.0.1:11434 http://localhost:8080 http://127.0.0.1:8080 https://*.model-endpoint.placeholder",
  )
  const r = runGate(dir)
  assert.equal(r.status, 0, `expected pass, got ${r.status}\n${r.stdout}${r.stderr}`)
})
