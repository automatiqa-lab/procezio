// v0.4 C-TASK - name and narrate the composer's target state (the LLM labels; it never decides).
//
// Spec v0.4 section 9: the target-state composer is DETERMINISTIC - core/composeToBe already
// chose which elements change, under which rung, and the estimator delta. This task asks the
// model only for the human-facing name + narrative of that snapshot, grounded strictly in the
// changes it is handed. It writes no number and no structure; on any failure it returns null and
// the snapshot simply carries no name (the to-be is fully usable without a model - constitution
// p6). Pure of DOM/network (client transport injected), so it runs headless with a stub client.

import type { LlmClient, ComposeResult } from '@procezio/core'
import type { Canvas, ComposerNamingOutput } from '@procezio/schema'
import { getPrompt } from './prompts.js'
import { summarizeCanvas } from './chat.js'
import { makeValidator } from './validator.js'

/** Validate {name, narrative}: both non-empty strings. */
const validateNaming = makeValidator(
  (d: unknown): d is ComposerNamingOutput => {
    if (typeof d !== 'object' || d === null) return false
    const o = d as { name?: unknown; narrative?: unknown }
    if (typeof o.name !== 'string' || o.name.trim().length === 0) return false
    if (typeof o.narrative !== 'string' || o.narrative.trim().length === 0) return false
    return true
  },
  '',
  'must be {name, narrative} (both non-empty)',
)

/** One line per composed change, tagged with the element id and its rung, for the prompt. */
function changesText(composed: ComposeResult): string {
  return composed.changes
    .map((c) => `${c.element_ref}: ${c.rung}${c.note ? ` - ${c.note}` : ''}`)
    .join('\n')
}

/**
 * Ask the model to name + narrate the composed to-be. Returns the trimmed {name, narrative}, or
 * null if there is nothing to name (no changes), the model is unreachable, or it never produces a
 * valid pair.
 */
export async function runComposerNaming(
  client: LlmClient,
  canvas: Canvas,
  composed: ComposeResult,
): Promise<ComposerNamingOutput | null> {
  if (composed.changes.length === 0) return null
  const p = getPrompt('composer-naming', {
    canvas: summarizeCanvas(canvas),
    changes: changesText(composed),
    delta: JSON.stringify(composed.delta ?? {}),
  })
  try {
    const result = await client.requestJson(
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      validateNaming,
    )
    if (!result.ok) return null
    return { name: result.value.name.trim(), narrative: result.value.narrative.trim() }
  } catch {
    return null
  }
}
