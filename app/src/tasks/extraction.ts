// v0.4 C-TASK - the Auditor's Shoebox extraction (the LLM surfaces, the human accepts).
//
// Spec 01b section 7: when a Shoebox item is consented into the agent's context, the Process
// Auditor reads it and surfaces CANDIDATE chips - a step, rule, or data source the text implies
// that may be missing from the map. It never writes to the map or invents; every chip is a
// pencil suggestion the human accepts (-> a real node.created) or ignores. On any failure it
// returns null and nothing is surfaced (the methodology works with no model - constitution p6).
//
// Pure of DOM/network (client transport injected), so it runs headless with a stub client.

import type { LlmClient } from '@procezio/core'
import type { ExtractionChip } from '@procezio/schema'
import { asUntrustedData, getPrompt } from './prompts.js'
import { makeValidator } from './validator.js'

interface ExtractionOutput {
  chips: ExtractionChip[]
}

/** Validate the extraction output: an array of chips, each with non-empty text. */
const validateExtraction = makeValidator(
  (d: unknown): d is ExtractionOutput => {
    if (typeof d !== 'object' || d === null) return false
    const o = d as { chips?: unknown }
    if (!Array.isArray(o.chips)) return false
    return o.chips.every((c) => {
      if (typeof c !== 'object' || c === null) return false
      const chip = c as { text?: unknown; suggests?: unknown }
      if (typeof chip.text !== 'string' || chip.text.trim().length === 0) return false
      if (chip.suggests !== undefined && typeof chip.suggests !== 'string') return false
      return true
    })
  },
  '/chips',
  'must be an array of {text, suggests?} chips',
)

/**
 * Ask the Auditor to extract candidate chips from a consented Shoebox item. Returns the
 * trimmed chips (possibly empty when the item implies nothing new), or null if the model is
 * unreachable or never produces a valid list.
 */
export async function runExtraction(
  client: LlmClient,
  itemText: string,
  canvasSummary: string,
): Promise<ExtractionChip[] | null> {
  // The item is third-party text (a note, a filename) - framed as data, never instructions.
  const p = getPrompt('extraction', { item: asUntrustedData(itemText), canvas: canvasSummary })
  try {
    const result = await client.requestJson(
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      validateExtraction,
    )
    if (!result.ok) return null
    return result.value.chips.map((c) => ({
      text: c.text.trim(),
      ...(c.suggests && c.suggests.trim() ? { suggests: c.suggests.trim() } : {}),
    }))
  } catch {
    return null
  }
}
