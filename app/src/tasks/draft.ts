// C-TASK #1d - the agent drafts the zone-8 business case from canvas data.
//
// The converge capstone (spec v0.2 section 10, v0.3 A1): the agent drafts a
// decision-ready case for ONE gate-cleared opportunity - cost and benefit figures,
// each tracing to a canvas source (the iron traceability rule: invent no number),
// plus a flagged assumption annex. It is BORN PENCIL (agent-authored): nothing is
// truth until the human accepts it (two-ink rule, M2-16). This is the agent-authored
// counterpart of buildCaseDraftedCandidate (which is the human ink draft).
//
// v0.3 A1 (hard rule): every benefit must be CLASSIFIED - hard-savings, capacity-release,
// or quality-speed - and the classification is preserved on the figure, never stripped.
// A failure yields null and no case is drafted, so turning the model off degrades the
// prompt, never correctness (constitution p6: the agent accelerates, never gates).
//
// Pure of DOM/React and of the network (the client's transport is injected), so it runs
// headless under `node --test` with a stub client.

import type { LlmClient } from '@procezio/core'
import type { CasePayload } from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { agentPencil } from '../store/envelope.js'
import { getPrompt } from './prompts.js'
import { makeValidator } from './validator.js'
import { FIGURE_KINDS, BENEFIT_CLASSES, CONFIDENCE_LEVELS } from '../case/events.js'

/**
 * The render inputs for the draft-case prompt's placeholders. The caller assembles the
 * canvas string from the opportunity's traced zone data; this task does not read the
 * canvas projection itself.
 */
export interface DraftCtx {
  opportunityId: string
  title: string
  canvas: string
}

const KINDS = new Set<string>(FIGURE_KINDS)
const CLASSES = new Set<string>(BENEFIT_CLASSES)
const CONFIDENCES = new Set<string>(CONFIDENCE_LEVELS)

type DraftFigure = CasePayload['figures'][number]
type DraftAssumption = CasePayload['assumptions'][number]

/**
 * Validate a draft-case output structurally over $defs/CasePayload: a committed
 * opportunity id, figures that each trace to a canvas source_ref and carry a valid
 * cost/benefit kind (benefits additionally carry one of the three benefit classes,
 * v0.3 A1), and assumptions that each carry a statement, a source, and a low/med/high
 * confidence. A hand type-guard (with the ajv-shaped errors the repair loop reads) - the
 * schema package ships precompiled validators only for the top-level Canvas/EventEnvelope,
 * and the store re-validates every dispatched event against the ratified contract anyway.
 */
const validateDraft = makeValidator(
  (d: unknown): d is CasePayload => {
    if (typeof d !== 'object' || d === null) return false
    const o = d as Partial<CasePayload>
    if (typeof o.opportunity_id !== 'string' || o.opportunity_id.length === 0) return false
    if (!Array.isArray(o.figures)) return false
    for (const f of o.figures) {
      const fig = f as Partial<DraftFigure>
      if (typeof fig.label !== 'string' || fig.label.length === 0) return false
      if (typeof fig.value !== 'string' || fig.value.length === 0) return false
      if (typeof fig.source_ref !== 'string' || fig.source_ref.length === 0) return false
      if (typeof fig.kind !== 'string' || !KINDS.has(fig.kind)) return false
      if (
        fig.kind === 'benefit' &&
        (typeof fig.benefit_class !== 'string' || !CLASSES.has(fig.benefit_class))
      )
        return false
    }
    if (!Array.isArray(o.assumptions)) return false
    for (const a of o.assumptions) {
      const asm = a as Partial<DraftAssumption>
      if (typeof asm.statement !== 'string' || asm.statement.length === 0) return false
      if (typeof asm.source !== 'string' || asm.source.length === 0) return false
      if (typeof asm.confidence !== 'string' || !CONFIDENCES.has(asm.confidence)) return false
    }
    return true
  },
  '',
  'must be {opportunity_id, figures:[{label,value,source_ref,kind:"cost"|"benefit",benefit_class?}], assumptions:[{statement,source,confidence:"low"|"med"|"high"}]}',
)

/**
 * Ask the model to draft the business case for `ctx`. Returns the validated payload with
 * its opportunity_id FORCED to ctx.opportunityId (never trust the model to echo the id it
 * was given), or null if the model is unreachable or never produces a valid case (no case
 * is drafted). The benefit_class classification rides through untouched (v0.3 A1).
 */
export async function draftCase(client: LlmClient, ctx: DraftCtx): Promise<CasePayload | null> {
  const p = getPrompt('draft-case', {
    opportunity_id: ctx.opportunityId,
    title: ctx.title,
    canvas: ctx.canvas,
  })
  try {
    const result = await client.requestJson(
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      validateDraft,
    )
    return result.ok ? { ...result.value, opportunity_id: ctx.opportunityId } : null
  } catch {
    return null
  }
}

/**
 * Turn the draft into an AGENT-authored candidate (case.drafted), born pencil so the
 * human reviews it (two-ink rule, M2-16). The payload is the bare CasePayload with the
 * forced opportunity_id; C9 upserts it by opportunity_id (M2-AMD2). Returns null when no
 * case could be drafted (the methodology works with no model - constitution p6).
 */
export async function draftCaseCandidate(
  client: LlmClient,
  sessionId: string,
  ctx: DraftCtx,
): Promise<DispatchCandidate | null> {
  const payload = await draftCase(client, ctx)
  if (payload === null) return null
  return agentPencil(sessionId, 'case.drafted', payload, 'agent', { schemaVersion: '1.0' })
}
