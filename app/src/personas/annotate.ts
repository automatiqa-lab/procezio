// v0.4 C-TASK - a stakeholder persona's simulated annotation (spec v0.4 section 6, Wave 2 B4).
//
// The app decides WHEN a persona speaks (a safe trigger, the user's summon) and hands the model
// the persona's role + perspective as guarded content. The model only voices ONE annotation from
// that viewpoint and lists any canvas ids it leans on; it never approves, vetoes, or invents data.
// cited_refs are filtered to real canvas ids so an annotation never dangles. On any failure it
// returns null and no annotation is added (the methodology works with no model - constitution p6).
//
// Pure of DOM/network (client transport injected), so it runs headless with a stub client.

import type { LlmClient } from '@procezio/core'
import type { Canvas, PersonaAnnotationOutput, StakeholderPersona } from '@procezio/schema'
import { getPrompt } from '../tasks/prompts.js'
import { summarizeCanvas } from '../tasks/chat.js'
import { citableRefs } from '../tasks/challenger.js'
import { makeValidator } from '../tasks/validator.js'

const validateAnnotation = makeValidator(
  (d: unknown): d is PersonaAnnotationOutput => {
    if (typeof d !== 'object' || d === null) return false
    const o = d as { text?: unknown; cited_refs?: unknown }
    if (typeof o.text !== 'string' || o.text.trim().length === 0) return false
    if (o.cited_refs !== undefined) {
      if (!Array.isArray(o.cited_refs)) return false
      if (!o.cited_refs.every((r) => typeof r === 'string')) return false
    }
    return true
  },
  '',
  'must be {text, cited_refs?}',
)

export interface PersonaAnnotation {
  text: string
  cited_refs: string[]
}

/**
 * Ask the model to voice one simulated annotation for `persona`, keeping only cited_refs that
 * exist on the canvas. Returns the trimmed annotation, or null if the model is unreachable or
 * never produces valid text.
 */
export async function runPersonaAnnotation(
  client: LlmClient,
  persona: StakeholderPersona,
  canvas: Canvas,
): Promise<PersonaAnnotation | null> {
  const p = getPrompt('persona-annotation', {
    name: persona.name,
    role: persona.role,
    perspective: persona.perspective,
    canvas: summarizeCanvas(canvas),
  })
  try {
    const result = await client.requestJson(
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      validateAnnotation,
    )
    if (!result.ok) return null
    const known = citableRefs(canvas)
    const refs = (result.value.cited_refs ?? []).map((r) => r.trim()).filter((r) => known.has(r))
    return { text: result.value.text.trim(), cited_refs: refs }
  } catch {
    return null
  }
}
