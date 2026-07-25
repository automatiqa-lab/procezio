// C10 - compensating-event constructor tests.
//
// Proves the helper builds a correct compensating event for ANY target family
// (not just node.created), deterministically from injected id/ts/author, with a
// self-contained (deep-cloned, non-aliased) payload. Runs against the SAME 15-
// family corpus the schema/store/projection tests use.
//
// Resolution mirrors the sibling tests: node --test runs from the repo root, so
// the fixture is read via process.cwd(). This test file may touch node:* (the
// module under test may not); it uses node:fs only to load the fixture and to
// statically scan compensate.ts for forbidden node imports / clock / randomness.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Author, EventEnvelope } from '@procezio/schema'
import { createCompensatingEvent } from './compensate.js'

const root = process.cwd()
const samples = JSON.parse(
  readFileSync(join(root, 'schema/fixtures/event-envelope.samples.json'), 'utf8'),
) as EventEnvelope[]

const HUMAN: Author = { kind: 'human', id: 'user-1' }
const AGENT: Author = { kind: 'agent', id: 'agent', model_ref: 'ollama/llama3.1' }

test('createCompensatingEvent builds a correct compensating event for ANY target family', () => {
  assert.equal(samples.length, 15, 'fixture must carry all 15 payload families')

  for (const target of samples) {
    const opts = {
      eventId: `undo-${target.event_id}`,
      ts: '2026-07-06T12:00:00Z',
      author: HUMAN,
    }
    const c = createCompensatingEvent(target, opts)

    // Same family + linkage back to the target it reverses.
    assert.equal(c.type, target.type, `${target.type}: type mirrors the target`)
    assert.equal(c.compensates, target.event_id, `${target.type}: compensates the target`)
    assert.equal(c.causation_id, target.event_id, `${target.type}: caused by the target`)
    assert.equal(c.correlation_id, target.correlation_id, `${target.type}: same correlation`)
    assert.equal(c.session_id, target.session_id, `${target.type}: same session`)
    assert.equal(c.schema_version, target.schema_version, `${target.type}: same schema_version`)

    // Injected determinism inputs are used verbatim - no clock, no id minting.
    assert.equal(c.event_id, opts.eventId, `${target.type}: id is injected`)
    assert.equal(c.ts, opts.ts, `${target.type}: ts is injected`)

    // Payload is a deep clone, not an alias: equal by value, different reference,
    // and mutating the copy never touches the target.
    assert.deepEqual(c.payload, target.payload, `${target.type}: payload equals target's`)
    assert.notStrictEqual(c.payload, target.payload, `${target.type}: payload is a fresh object`)
    ;(c.payload as unknown as Record<string, unknown>).__probe = 'mutated'
    assert.equal(
      (target.payload as unknown as Record<string, unknown>).__probe,
      undefined,
      `${target.type}: mutating the clone does not alias the target`,
    )
  }
})

test('the born provenance state follows author.kind (human => ink, agent => pencil)', () => {
  const target = samples[2] as EventEnvelope // node.created
  const base = { eventId: 'undo-x', ts: '2026-07-06T12:00:00Z' }

  const byHuman = createCompensatingEvent(target, { ...base, author: HUMAN })
  assert.equal(byHuman.provenance.state, 'ink', 'a human-authored undo is born ink')

  const byAgent = createCompensatingEvent(target, { ...base, author: AGENT })
  assert.equal(byAgent.provenance.state, 'pencil', 'an agent-authored undo is born pencil')
})

test('compensate.ts imports nothing from node:*, and calls no Date.now / Math.random', () => {
  const raw = readFileSync(join(root, 'core', 'src', 'compensate.ts'), 'utf8')
  // Scan executable code only: strip comments so the header prose is not a hit.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(src, /from\s+['"]node:/, 'compensate must not import from node:*')
  const BUILTINS = [
    'fs',
    'path',
    'os',
    'crypto',
    'util',
    'child_process',
    'stream',
    'http',
    'https',
    'net',
    'url',
    'events',
    'buffer',
    'process',
    'assert',
  ]
  const bare = new RegExp(`from\\s+['"](?:${BUILTINS.join('|')})['"]`)
  assert.doesNotMatch(src, bare, 'compensate must not import a bare node builtin')
  assert.doesNotMatch(src, /Date\.now\(/, 'the constructor must not read the clock')
  assert.doesNotMatch(src, /Math\.random\(/, 'the constructor must not use randomness')
})
