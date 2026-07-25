// The PURE half of the Zone 8 (Improvement case) surface - every canvas- or
// draft-derived computation CaseZone.tsx needs, extracted so it is headless-testable
// under `node --test`. The .tsx stays presentational: it reads these derivations and
// renders. No React, no store - inputs are the projected Canvas (or plain draft
// values from the form), outputs are plain data.
//
// The split matters for the two hard rules this zone carries: traceability (a figure
// draft is only valid once it cites a source_ref) and v0.3 A1 (a benefit is
// classified; a capacity-release benefit carries a redeployment owner only when one
// is actually named). Both live here as pure functions, provable without a DOM.

import type { Assumption, Canvas, CasePayload, Opportunity } from '@procezio/schema'
import { GATE_CHECKS, allChecksCleared, statusOf } from '../gate/events.js'
import type { Figure } from './events.js'
import { nodeLabel } from '../nodeLabel.js'

/**
 * Assemble the canvas data the agent draft draws from - steps, friction, and
 * data/rules tags, each tagged with the element id the model must use as a figure's
 * source_ref (no invented numbers; every figure traces to one of these).
 */
export function assembleCanvasData(canvas: Canvas): string {
  const lines: string[] = []
  const p = canvas.process
  if (p.north_star?.trim()) lines.push(`north-star: ${p.north_star.trim()}`)
  if (p.volume?.trim()) lines.push(`volume: ${p.volume.trim()}`)
  if (p.touch_time?.trim()) lines.push(`touch time: ${p.touch_time.trim()}`)
  for (const n of canvas.nodes) lines.push(`[${n.id}] step "${nodeLabel(n)}"`)
  for (const f of canvas.friction ?? [])
    lines.push(`[${f.id}] friction on ${f.node_id}: ${f.waste}${f.note ? ` (${f.note})` : ''}`)
  for (const a of canvas.audit_tags ?? [])
    lines.push(`[${a.id}] data/rules for ${a.node_id}: ${a.data}, ${a.rules}, ${a.exceptions}`)
  // The assumption ledger joins the draft context (2026-07-24b): a figure resting on a
  // gut-feel number must say so, and revising an assumption must be able to move the
  // case. Only id-carrying entries are listed as citable (a source_ref needs an id).
  for (const a of canvas.assumptions ?? []) {
    if (a.id === undefined) continue
    const verify = a.verify_by ? `, verify: ${a.verify_by}` : ''
    lines.push(
      `[${a.id}] assumption (${a.confidence} confidence${verify}): ${a.statement} (source: ${a.source})`,
    )
  }
  return lines.length > 0 ? lines.join('\n') : '(the canvas has little data yet)'
}

/**
 * Everything the agent case draft READS for one opportunity, folded to a comparison
 * key. The auto-redraft loop (2026-07-24b) re-drafts exactly when this changes.
 * Deliberately excludes canvas.cases - the draft WRITES there, and including it
 * would re-trigger on the draft's own dispatch (an infinite loop).
 */
export function draftInputsFingerprint(canvas: Canvas, opportunity: Opportunity): string {
  return JSON.stringify([opportunity.title, opportunity.rung ?? '', assembleCanvasData(canvas)])
}

/**
 * The zone's shortlist: only opportunities the user COMMITTED in zone 6 can hold a
 * case (the anti-anchoring commit is the entry ticket; triage alone is not enough).
 */
export function committedOpportunities(canvas: Canvas): Opportunity[] {
  return (canvas.opportunities ?? []).filter((o) => o.committed === true)
}

/**
 * Where one shortlisted opportunity stands on the way to a case. 'blocked' = the
 * zone-7 gate has not cleared all five checks (the gate blocks the case, so a saved
 * draft - if any - is not surfaced); 'cleared' = gate open, no draft yet; 'drafted'
 * = gate open and a case draft saved.
 */
export type CaseStatus = 'blocked' | 'cleared' | 'drafted'

/** Derive the shortlist status of one opportunity from the projected gates + cases. */
export function caseStatusFor(canvas: Canvas, opportunityId: string): CaseStatus {
  if (!allChecksCleared(canvas.gates ?? [], opportunityId)) return 'blocked'
  const drafted = (canvas.cases ?? []).some((c) => c.opportunity_id === opportunityId)
  return drafted ? 'drafted' : 'cleared'
}

/**
 * May this opportunity hold a case at all? True once the zone-7 gate cleared all
 * five checks - the builder is unreachable before that (spec v0.2 section 6: the
 * gate "blocks the case").
 */
export function isCaseEligible(canvas: Canvas, opportunityId: string): boolean {
  return allChecksCleared(canvas.gates ?? [], opportunityId)
}

/** How many of the risk-gate checks are cleared for this opportunity (watermark copy). */
export function clearedChecks(canvas: Canvas, opportunityId: string): number {
  return GATE_CHECKS.filter(
    (check) => statusOf(canvas.gates ?? [], opportunityId, check) === 'cleared',
  ).length
}

/** The saved case draft for this opportunity (C9 upserts by opportunity_id), or null. */
export function savedCaseFor(canvas: Canvas, opportunityId: string): CasePayload | null {
  return (canvas.cases ?? []).find((c) => c.opportunity_id === opportunityId) ?? null
}

/** A blank figure draft for the form - a benefit defaulting to hard-savings. */
export const emptyFigure = (): Figure => ({
  label: '',
  value: '',
  source_ref: '',
  kind: 'benefit',
  benefit_class: 'hard-savings',
})

/** A blank assumption draft for the form - confidence defaulting to the middle. */
export const emptyAssumption = (): Assumption => ({ statement: '', source: '', confidence: 'med' })

/**
 * A figure draft is addable once it has a label, a value, and - the traceability
 * rule - a cited source_ref. Whitespace-only text does not count.
 */
export function isFigureDraftValid(fig: Figure): boolean {
  return fig.label.trim().length > 0 && fig.value.trim().length > 0 && fig.source_ref.length > 0
}

/** An assumption draft is addable once it has a statement and a source. */
export function isAssumptionDraftValid(asm: Assumption): boolean {
  return asm.statement.trim().length > 0 && asm.source.trim().length > 0
}

/**
 * Normalize a valid figure draft into the figure that joins the case. Built via
 * literal + conditional spreads (exactOptionalPropertyTypes: never assign an
 * optional key to undefined). A cost figure carries no benefit classification; a
 * benefit carries its class, plus a redeployment owner only when it is a non-empty
 * capacity-release owner (v0.3 A1).
 */
export function finalizeFigure(fig: Figure): Figure {
  const label = fig.label.trim()
  const value = fig.value.trim()
  const source_ref = fig.source_ref
  if ((fig.kind ?? 'benefit') === 'benefit') {
    const benefit_class = fig.benefit_class ?? 'hard-savings'
    const owner = (fig.redeployment_owner ?? '').trim()
    return {
      label,
      value,
      source_ref,
      kind: 'benefit',
      benefit_class,
      ...(benefit_class === 'capacity-release' && owner.length > 0
        ? { redeployment_owner: owner }
        : {}),
    }
  }
  return { label, value, source_ref, kind: 'cost' }
}

/**
 * Normalize a valid assumption draft into the assumption that joins the annex:
 * trimmed, with verify_by included only when non-empty (exactOptionalPropertyTypes).
 */
export function finalizeAssumption(asm: Assumption): Assumption {
  const base: Assumption = {
    statement: asm.statement.trim(),
    source: asm.source.trim(),
    confidence: asm.confidence,
  }
  const vb = (asm.verify_by ?? '').trim()
  if (vb.length > 0) base.verify_by = vb
  return base
}

/** Split the case figures into the two columns the case renders (v0.3 A1: both sides). */
export function splitFigures(figures: readonly Figure[]): { costs: Figure[]; benefits: Figure[] } {
  return {
    costs: figures.filter((f) => f.kind === 'cost'),
    benefits: figures.filter((f) => f.kind === 'benefit'),
  }
}

/**
 * Does the working draft differ from the saved case? Structural comparison via JSON
 * (figures and assumptions are plain schema data, so key order is construction
 * order and the comparison is stable). A fresh builder over no saved case is NOT
 * dirty - there is nothing to save yet.
 */
export function isCaseDirty(
  figures: readonly Figure[],
  assumptions: readonly Assumption[],
  savedCase: CasePayload | null,
): boolean {
  return (
    JSON.stringify({ f: figures, a: assumptions }) !==
    JSON.stringify({ f: savedCase?.figures ?? [], a: savedCase?.assumptions ?? [] })
  )
}
