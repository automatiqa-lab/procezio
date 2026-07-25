// C-LLM acceptance test - the slim LLM client over a FAKE transport.
//
// Named criterion (CardContract / ImplPlan.testName):
//   "over an injected transport, the client completes with retry+fallback, requests
//    schema-valid JSON with bounded repair (feeding ajv errors back), extracts JSON from
//    fenced/prose output, meters every call, and probes a capability tier T0..T3 - with
//    no network and no real clock"
//
// The whole client is deterministic here: the transport is a canned function and sleep
// is a no-op, so every branch (retry, fallback, repair, unparseable, probe grade) runs
// headless under `node --test`. The real fetch transport is exercised by the user
// against their own BYO endpoint - it is thin and out of a unit test's scope.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createFetchTransport,
  createLlmClient,
  extractJson,
  type AuthStyle,
  type LlmTransport,
  type SchemaValidator,
} from './llm-client.js'

const noSleep = async (): Promise<void> => {}
const CONFIG = { endpoint: 'https://model.example/v1', model: 'test-model' }

/** A transport that returns a fixed script of responses, throwing the Error entries. */
function scripted(...responses: Array<string | Error>): LlmTransport {
  let i = 0
  return async () => {
    const r = responses[Math.min(i, responses.length - 1)]!
    i += 1
    if (r instanceof Error) throw r
    return r
  }
}

/** A validator for { ok: true }: a type guard with an ajv-shaped errors array. */
const okValidator: SchemaValidator<{ ok: boolean }> = Object.assign(
  (d: unknown): d is { ok: boolean } =>
    typeof d === 'object' && d !== null && typeof (d as { ok?: unknown }).ok === 'boolean',
  {
    errors: [{ instancePath: '/ok', message: 'must be boolean' }] as Array<{
      instancePath?: string
      message?: string
    }> | null,
  },
)

// --- complete: retry then success, and fallback ------------------------------

test('complete retries a transient failure then succeeds, metering the attempts', async () => {
  const client = createLlmClient({
    config: CONFIG,
    transport: scripted(new Error('boom'), 'hello there'),
    sleep: noSleep,
  })
  const r = await client.complete([{ role: 'user', content: 'hi' }])
  assert.equal(r.text, 'hello there', 'the completion returns the model text')
  assert.equal(r.metering.attempts, 2, 'one retry then success => 2 attempts')
  assert.equal(r.metering.prompt_chars, 2, 'prompt chars are metered')
  assert.equal(r.metering.completion_chars, 'hello there'.length, 'completion chars are metered')
})

test('complete falls back to the next config when the primary keeps failing', async () => {
  const client = createLlmClient({
    config: { ...CONFIG, fallback: [{ endpoint: 'https://backup/v1', model: 'backup-model' }] },
    // Primary: 3 failures (1 + 2 retries) then the fallback succeeds.
    transport: scripted(new Error('x'), new Error('x'), new Error('x'), 'from backup'),
    sleep: noSleep,
  })
  const r = await client.complete([{ role: 'user', content: 'hi' }])
  assert.equal(r.text, 'from backup', 'the fallback config produced the completion')
  assert.equal(r.metering.model, 'backup-model', 'metering names the model that answered')
})

// --- requestJson: valid, repaired, and never-valid ---------------------------

test('requestJson returns a schema-valid value on the first try (0 repairs)', async () => {
  const client = createLlmClient({
    config: CONFIG,
    transport: scripted('{"ok": true}'),
    sleep: noSleep,
  })
  const r = await client.requestJson([{ role: 'user', content: 'x' }], okValidator)
  assert.ok(r.ok, 'valid JSON first try')
  if (r.ok) {
    assert.deepEqual(r.value, { ok: true }, 'the parsed value is returned')
    assert.equal(r.metering.repairs, 0, 'no repair rounds were needed')
  }
})

test('requestJson repairs invalid output by feeding schema errors back, then succeeds', async () => {
  const client = createLlmClient({
    config: CONFIG,
    // First: valid JSON but wrong shape; second (repair): correct.
    transport: scripted('{"nope": 1}', '{"ok": false}'),
    sleep: noSleep,
  })
  const r = await client.requestJson([{ role: 'user', content: 'x' }], okValidator)
  assert.ok(r.ok, 'the repair round produced valid output')
  if (r.ok) {
    assert.deepEqual(r.value, { ok: false }, 'the corrected value is returned')
    assert.equal(r.metering.repairs, 1, 'exactly one repair round was used')
  }
})

test('requestJson gives up after maxRepairs with ok:false (never a bad value)', async () => {
  const client = createLlmClient({
    config: CONFIG,
    transport: scripted('not json', 'still not json', 'nope'),
    sleep: noSleep,
    maxRepairs: 2,
  })
  const r = await client.requestJson([{ role: 'user', content: 'x' }], okValidator)
  assert.equal(r.ok, false, 'unrepairable output fails closed')
})

// --- extractJson: fenced, prose-wrapped, bare --------------------------------

test('extractJson pulls JSON from fenced, prose-wrapped, and bare output', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 }, 'fenced')
  assert.deepEqual(extractJson('Sure! {"a":2} hope that helps'), { a: 2 }, 'prose-wrapped')
  assert.deepEqual(extractJson('{"a":3}'), { a: 3 }, 'bare')
  assert.throws(() => extractJson('no json here'), 'throws when there is no object')
})

// --- probe: T0..T3 grading ----------------------------------------------------

test('probe grades the model: T0 unreachable, T1 free-text, T2 repaired, T3 first-try', async () => {
  const t0 = createLlmClient({
    config: CONFIG,
    transport: scripted(new Error('down')),
    sleep: noSleep,
    maxRetries: 0,
  })
  assert.deepEqual(
    await t0.probe(okValidator),
    { tier: 'T0', reachable: false },
    'unreachable => T0',
  )

  const t1 = createLlmClient({
    config: CONFIG,
    transport: scripted('I cannot do JSON, sorry'),
    sleep: noSleep,
  })
  assert.equal((await t1.probe(okValidator)).tier, 'T1', 'reachable but no valid JSON => T1')

  const t2 = createLlmClient({
    config: CONFIG,
    transport: scripted('nope', '{"ok":true}'),
    sleep: noSleep,
  })
  assert.equal((await t2.probe(okValidator)).tier, 'T2', 'valid only after a repair => T2')

  const t3 = createLlmClient({ config: CONFIG, transport: scripted('{"ok":true}'), sleep: noSleep })
  assert.equal((await t3.probe(okValidator)).tier, 'T3', 'valid first try => T3')
})

// --- purity: the client module has no node:* / clock / RNG -------------------

test('llm-client.ts imports no node:* and reads no wall clock / randomness directly', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const raw = readFileSync(join(process.cwd(), 'core', 'src', 'llm-client.ts'), 'utf8')
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(src, /from\s+['"]node:/, 'no node:* imports (isomorphic)')
  assert.doesNotMatch(src, /Date\.now\(|new Date\(/, 'no direct wall-clock read')
  assert.doesNotMatch(src, /Math\.random\(/, 'no direct randomness')
})

// --- the fetch transport presents the key per authStyle (bearer/x-api-key/api-key/none)

test('createFetchTransport applies the auth style for each provider shape', async () => {
  const seen: Array<Record<string, string>> = []
  const orig = globalThis.fetch
  globalThis.fetch = (async (_url: string, init: { headers: Record<string, string> }) => {
    seen.push(init.headers)
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      text: async () => '',
    }
  }) as unknown as typeof fetch
  try {
    const t = createFetchTransport()
    const call = (authStyle?: AuthStyle) =>
      t({
        config: {
          endpoint: 'http://x/v1',
          model: 'm',
          apiKey: 'SECRET',
          ...(authStyle ? { authStyle } : {}),
        },
        messages: [{ role: 'user', content: 'hi' }],
        json: false,
      })
    await call() // default bearer
    await call('x-api-key')
    await call('api-key')
    await call('none')
  } finally {
    globalThis.fetch = orig
  }
  assert.equal(seen[0]?.authorization, 'Bearer SECRET', 'default is a Bearer header')
  assert.equal(seen[1]?.['x-api-key'], 'SECRET', 'x-api-key style')
  assert.equal(seen[2]?.['api-key'], 'SECRET', 'api-key style')
  assert.equal(seen[3]?.authorization, undefined, 'none sends no Bearer')
  assert.equal(seen[3]?.['x-api-key'], undefined, 'none sends no key header at all')
})

// --- the fetch transport aborts a hung endpoint (timeout) --------------------

test('createFetchTransport times out a reachable-but-hung endpoint with a clear error', async () => {
  const orig = globalThis.fetch
  // A fetch that never resolves until its abort signal fires - a socket that hangs.
  globalThis.fetch = ((_url: string, init: { signal: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })) as unknown as typeof fetch
  try {
    const t = createFetchTransport({ timeoutMs: 30 })
    await assert.rejects(
      t({
        config: { endpoint: 'http://x/v1', model: 'm' },
        messages: [{ role: 'user', content: 'hi' }],
        json: false,
      }),
      /timed out/,
      'a hung request rejects with a timeout message, never spins forever',
    )
  } finally {
    globalThis.fetch = orig
  }
})

// --- cancellation: a caller's abort stops the call, with no retry/fallback ----

test('a cancelled call rejects immediately and never retries or falls back', async () => {
  let calls = 0
  // A transport that hangs until the caller's signal aborts it.
  const hanging: LlmTransport = (req) =>
    new Promise((_resolve, reject) => {
      calls += 1
      req.signal?.addEventListener('abort', () => reject(new Error('LLM request cancelled')))
    })
  const client = createLlmClient({
    config: { ...CONFIG, fallback: [{ endpoint: 'https://backup/v1', model: 'backup' }] },
    transport: hanging,
    sleep: noSleep,
  })
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(
    client.complete([{ role: 'user', content: 'hi' }], { signal: controller.signal }),
    /cancelled/,
    'the rejection names the cancel',
  )
  assert.equal(calls, 1, 'a cancel is not a transient fault: no retry, no fallback config')
})

test('createFetchTransport distinguishes a caller cancel from its own timeout', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = ((_url: string, init: { signal: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })) as unknown as typeof fetch
  try {
    const t = createFetchTransport({ timeoutMs: 5000 })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 10)
    await assert.rejects(
      t({
        config: { endpoint: 'http://x/v1', model: 'm' },
        messages: [{ role: 'user', content: 'hi' }],
        json: false,
        signal: controller.signal,
      }),
      /cancelled/,
      'a user cancel says cancelled, not timed out',
    )
  } finally {
    globalThis.fetch = orig
  }
})

test('the timeout also covers a stalled BODY (200 + headers, then nothing)', async () => {
  const orig = globalThis.fetch
  // Headers arrive fine; the body read hangs until the fetch signal aborts it.
  globalThis.fetch = ((_url: string, init: { signal: AbortSignal }) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    })) as unknown as typeof fetch
  try {
    const t = createFetchTransport({ timeoutMs: 30 })
    await assert.rejects(
      t({
        config: { endpoint: 'http://x/v1', model: 'm' },
        messages: [{ role: 'user', content: 'hi' }],
        json: false,
      }),
      /timed out/,
      'a 200-then-stall response still times out instead of hanging the UI',
    )
  } finally {
    globalThis.fetch = orig
  }
})

test('a cancel pressed mid-body still stops the read and says cancelled', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = ((_url: string, init: { signal: AbortSignal }) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    })) as unknown as typeof fetch
  try {
    const t = createFetchTransport({ timeoutMs: 5000 })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 10)
    await assert.rejects(
      t({
        config: { endpoint: 'http://x/v1', model: 'm' },
        messages: [{ role: 'user', content: 'hi' }],
        json: false,
        signal: controller.signal,
      }),
      /cancelled/,
      'the guard is not disarmed at headers - the body read is still cancellable',
    )
  } finally {
    globalThis.fetch = orig
  }
})
