// C-TASK #1c - agent ideation candidates (the agent contributes, never judges).
//
// The diverge phase (spec v0.2 section 10, zone 5): the agent brainstorms automation
// candidates WITH the user, drawn from the steps and friction they mapped. It NEVER
// scores, ranks, or judges (that is the human's, later, in zone 6) - it only adds titles.
// Each candidate is born PENCIL (agent-authored) so the human accepts or rejects it
// (two-ink rule, M2-16). A failure yields null and nothing is added (the methodology
// works with no model - constitution p6).
//
// Pure of DOM/network (client transport injected), so it runs headless with a stub client.

import type { LlmClient } from '@procezio/core'
import type { Opportunity } from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { agentPencil } from '../store/envelope.js'
import { getPrompt } from './prompts.js'
import { makeValidator } from './validator.js'

/** The render inputs for the ideation prompt (mapped steps, friction, existing ideas). */
export interface IdeationCtx {
  steps: string
  friction: string
  existing: string
}

/** The ideation LLM output: a list of candidate titles (no scores, ever). */
interface IdeationOutput {
  candidates: string[]
}

/**
 * Validate the ideation output: a non-empty array of non-empty string titles. A hand
 * type-guard with ajv-shaped errors, matching the other task validators.
 */
const validateIdeation = makeValidator(
  (d: unknown): d is IdeationOutput => {
    if (typeof d !== 'object' || d === null) return false
    const o = d as { candidates?: unknown }
    if (!Array.isArray(o.candidates) || o.candidates.length === 0) return false
    return o.candidates.every((c) => typeof c === 'string' && c.trim().length > 0)
  },
  '/candidates',
  'must be a non-empty array of title strings',
)

/**
 * Ask the model for automation candidate titles. Returns the trimmed titles, or null if
 * the model is unreachable or never produces a valid list (nothing is added).
 */
export async function suggestCandidates(
  client: LlmClient,
  ctx: IdeationCtx,
): Promise<string[] | null> {
  const p = getPrompt('ideation', {
    steps: ctx.steps,
    friction: ctx.friction,
    existing: ctx.existing,
  })
  try {
    const result = await client.requestJson(
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      validateIdeation,
    )
    return result.ok ? result.value.candidates.map((c) => c.trim()) : null
  } catch {
    return null
  }
}

/**
 * Turn candidate titles into AGENT-authored, born-pencil opportunity.created candidates.
 * Judgment-free by construction (id + title only), exactly like a human ideation
 * candidate - the agent contributes ideas, it does not score them. Ids are minted by the
 * caller at the app edge and passed in (one per title).
 */
export function ideationCandidates(
  sessionId: string,
  titles: string[],
  ids: string[],
): DispatchCandidate[] {
  return titles.map((title, i) => {
    const opportunity: Opportunity = { id: ids[i] ?? title, title }
    return agentPencil(sessionId, 'opportunity.created', { opportunity }, 'agent', {
      schemaVersion: '1.0',
    })
  })
}
