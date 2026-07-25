// C-TASK #3 acceptance test - askAgent + chatCandidate + summarizeCanvas.
//
// Named criterion: "askAgent returns the model reply grounded in the canvas summary and
// null on failure/empty; chatCandidate logs an agent-authored, born-pencil agent.message;
// summarizeCanvas lists the canvas facts (never inventing)."
//
// Deterministic (stub client, no network). Live chat is the user's to verify.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askAgent, chatCandidate, summarizeCanvas } from './chat.js'
import { project } from '@procezio/core'
import type { Canvas } from '@procezio/schema'
import type { LlmClient } from '@procezio/core'

const metering = { model: 'stub', prompt_chars: 0, completion_chars: 0, attempts: 1, repairs: 0 }
function stub(text: string, throws = false): LlmClient {
  return {
    complete: async () => {
      if (throws) throw new Error('down')
      return { text, metering }
    },
    requestJson: async () => ({ ok: false as const, error: 'n/a', metering }),
    probe: async () => ({ tier: 'T1' as const, reachable: true }),
  }
}

const emptyCanvas: Canvas = project([])
const canvasWith: Canvas = {
  ...emptyCanvas,
  process: { ...emptyCanvas.process, name: 'Procure-to-Pay', north_star: 'cut cycle time' },
  nodes: [{ id: 'n1', type: 'Step', lane: 'ap', label: 'Match invoices', zone: 2 }],
}

test('askAgent returns the model reply on success', async () => {
  const reply = await askAgent(
    stub('Your match step has no data profile yet - add one in Zone 4.'),
    'what is missing?',
    canvasWith,
  )
  assert.match(reply ?? '', /match step/, 'the agent reply is returned')
})

test('askAgent returns null on an empty reply or a transport error', async () => {
  assert.equal(await askAgent(stub('   '), 'q', canvasWith), null, 'blank reply -> null')
  assert.equal(await askAgent(stub('x', true), 'q', canvasWith), null, 'a thrown error -> null')
})

test('chatCandidate logs an agent-authored, born-pencil agent.message', () => {
  const c = chatCandidate('sess', 'here is my answer')
  assert.equal(c.type, 'agent.message', 'agent.message event')
  assert.deepEqual(c.author, { kind: 'agent', id: 'agent' }, 'agent-authored')
  assert.equal(c.provenance.state, 'pencil', 'born pencil')
  assert.deepEqual(c.payload, { text: 'here is my answer' }, 'carries the reply text')
})

test('summarizeCanvas lists the canvas facts and never invents', () => {
  const s = summarizeCanvas(canvasWith)
  assert.match(s, /Procure-to-Pay/, 'the process name is summarized')
  assert.match(s, /cut cycle time/, 'the north-star is summarized')
  assert.match(s, /Match invoices/, 'the mapped step is summarized')
  assert.match(summarizeCanvas(emptyCanvas), /mostly empty/, 'an empty canvas says so')
})
