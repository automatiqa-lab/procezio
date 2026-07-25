// C-TASK acceptance test - the prompt-pack API (render + getPrompt).
//
// Named criterion (CardContract / ImplPlan.testName):
//   "render fills {{placeholders}} (missing => empty), getPrompt resolves each of the
//    five task templates with a non-empty system + user, and PROMPT_PACK_VERSION is set"
//
// Pure module (no LLM, no I/O), so it runs headless. Proves the crown-jewel prompt pack
// loads, is versioned, and renders deterministically - the language the agent speaks.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROMPT_PACK_VERSION, getPrompt, render, type PromptTaskId } from './prompts.js'

test('render substitutes {{placeholders}} and drops missing ones', () => {
  assert.equal(render('Hi {{name}}, {{when}}', { name: 'Aleks', when: 'today' }), 'Hi Aleks, today')
  assert.equal(render('a{{missing}}b', {}), 'ab', 'a missing var renders empty')
  assert.equal(render('n={{n}}', { n: 3 }), 'n=3', 'numbers stringify')
  assert.equal(render('no placeholders', {}), 'no placeholders', 'plain text is untouched')
})

test('getPrompt resolves every task with a non-empty system and user', () => {
  const tasks: PromptTaskId[] = [
    'reword-nudge',
    'seed-skeleton',
    'challenge',
    'ideation',
    'draft-case',
  ]
  for (const task of tasks) {
    const p = getPrompt(task, {
      template: 'x',
      anchor: '',
      description: 'd',
      opportunity_id: 'op-1',
      title: 't',
      benefit: 5,
      effort: 2,
      evidence: 'e',
      steps: 's',
      friction: 'f',
      existing: '',
      canvas: 'c',
    })
    assert.ok(p.system.trim().length > 0, `${task} has a system prompt`)
    assert.ok(p.user.trim().length > 0, `${task} has a user prompt`)
  }
})

test('getPrompt fills the reword-nudge template with the given nudge text', () => {
  const p = getPrompt('reword-nudge', { template: 'Commit your score first.', anchor: '' })
  assert.match(p.user, /Commit your score first\./, 'the nudge template lands in the user prompt')
})

test('the prompt pack is versioned', () => {
  assert.match(PROMPT_PACK_VERSION, /^\d+\.\d+\.\d+$/, 'a semver-ish version string is present')
})
