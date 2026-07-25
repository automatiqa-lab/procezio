// C-TASK - the nudge-rewording task (the LLM words what the rules decided).
//
// The layering principle, made concrete: the rule engine ALREADY decided this nudge
// should fire and carries a deterministic message_template. This task asks the model to
// say the same thing in warmer, plainer language for a non-coder - it never changes the
// decision, never adds a fact or a number, and on ANY failure falls back to the exact
// template. So turning the model off degrades wording, never correctness (constitution
// p6: the agent accelerates, never gates).
//
// Pure of DOM/React and of the network (the client's transport is injected), so it runs
// headless under `node --test` with a stub client.

import type { LlmClient, SchemaValidator } from '@procezio/core'
import { getPrompt } from './prompts.js'

/** The T1 LLM output contract (schema WordNudgeOutput): just the reworded text. */
interface WordNudgeOutput {
  text: string
}

/**
 * A local validator for WordNudgeOutput - the schema package ships precompiled
 * validators only for the top-level Canvas/EventEnvelope, and this shape is trivial, so
 * a hand type-guard (with the ajv-shaped errors the repair loop reads) is enough.
 */
const validateWordNudge: SchemaValidator<WordNudgeOutput> = Object.assign(
  (d: unknown): d is WordNudgeOutput =>
    typeof d === 'object' &&
    d !== null &&
    typeof (d as { text?: unknown }).text === 'string' &&
    (d as { text: string }).text.trim().length > 0,
  {
    errors: [{ instancePath: '/text', message: 'must be a non-empty string' }] as Array<{
      instancePath?: string
      message?: string
    }> | null,
  },
)

/**
 * Reword one nudge's message_template via the model, returning the reworded text - or the
 * original template unchanged if the model is unreachable or never returns valid output.
 * `northStar` (if named) is passed as light context so the wording can tie back to the
 * user's own anchor, but the model is told to invent nothing.
 */
export async function rewordNudge(
  client: LlmClient,
  template: string,
  northStar?: string,
): Promise<string> {
  const anchor =
    northStar !== undefined && northStar.trim().length > 0
      ? `\nThe user's north-star metric is: "${northStar.trim()}".`
      : ''
  const p = getPrompt('reword-nudge', { template, anchor })
  const messages = [
    { role: 'system' as const, content: p.system },
    { role: 'user' as const, content: p.user },
  ]
  try {
    const result = await client.requestJson(messages, validateWordNudge)
    return result.ok ? result.value.text.trim() : template
  } catch {
    return template
  }
}
