// M2-11 - the app-boundary event builder for the Zone 8 (Business case) surface.
//
// The PURE, isomorphic half of the Business-case zone - the capstone. Zone 8 drafts a
// decision-ready case per gate-cleared opportunity: cost and benefit figures, each
// tracing to a canvas source (traceability rule: no number is invented), plus a
// flagged assumption annex. The draft leaves the UI as one case.drafted event; C9
// folds it into canvas.cases, upserting by opportunity_id (M2-AMD2), so a redraft
// replaces the prior draft in place.
//
// v0.3 A1 (hard rule, enforced here and in the view): a benefit must be CLASSIFIED,
// and a capacity-release benefit is NOT savings until a redeployment owner is named.
// The template renders hard-savings / capacity-release / quality-speed separately and
// never sums freed hours into savings without an owner.
//
// Pure candidate builder like every zone's events.ts - see store/envelope.ts for the
// canonical purity/layering explanation.

import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
import type { Canvas, CasePayload } from '@procezio/schema'
import { nodeLabel } from '../nodeLabel.js'

/** One figure of a business case (a row of CasePayload.figures). */
export type Figure = CasePayload['figures'][number]

/** The two sides of the case (v0.3 A1: it must carry both). */
export const FIGURE_KINDS = ['cost', 'benefit'] as const

/** The three benefit classes (v0.3 A1), rendered separately, never summed together. */
export const BENEFIT_CLASSES = ['hard-savings', 'capacity-release', 'quality-speed'] as const
export type BenefitClass = (typeof BENEFIT_CLASSES)[number]

/** Plain-language gloss per benefit class, so a no-code user reads meaning. */
export const BENEFIT_CLASS_INFO = {
  'hard-savings': 'real money out the door falls (a cost you stop paying)',
  'capacity-release': 'hours freed - NOT savings until someone redeploys them',
  'quality-speed': 'fewer errors or faster cycle, not directly money',
} as const satisfies Record<BenefitClass, string>

/** Confidence levels for an assumption (matches the schema Assumption union). */
export const CONFIDENCE_LEVELS = ['low', 'med', 'high'] as const

/**
 * The v0.3 A1 flag: a capacity-release benefit with no redeployment owner. Freed hours
 * must never be summed into savings until this is named. Pure predicate over a figure.
 */
export function needsRedeploymentOwner(f: Figure): boolean {
  return (
    f.kind === 'benefit' &&
    f.benefit_class === 'capacity-release' &&
    (f.redeployment_owner ?? '').trim().length === 0
  )
}

/** A citable canvas source for a figure's source_ref: an id with a human label. */
export interface SourceOption {
  id: string
  label: string
}

/**
 * Gather every canvas element a figure could cite (traceability rule): the north-star
 * and frame live in zone 1, steps in zone 2, friction in zone 3, audit tags in zone 4.
 * Returns id+label pairs for the source_ref picker. Pure over the projection.
 */
export function sourceOptions(canvas: Canvas): SourceOption[] {
  const out: SourceOption[] = []
  for (const n of canvas.nodes) {
    out.push({ id: n.id, label: `Step: ${nodeLabel(n)}` })
  }
  for (const f of canvas.friction ?? []) {
    out.push({ id: f.id, label: `Friction: ${f.waste}${f.note ? ` - ${f.note}` : ''}` })
  }
  for (const a of canvas.audit_tags ?? []) {
    out.push({ id: a.id, label: `Data/rules: ${a.data} · ${a.rules} · ${a.exceptions}` })
  }
  // Ledger assumptions with a stable id are citable too (2026-07-24b): a figure that
  // rests on a gut-feel number should say exactly which one.
  for (const a of canvas.assumptions ?? []) {
    if (a.id !== undefined) out.push({ id: a.id, label: `Assumption: ${a.statement}` })
  }
  return out
}

/**
 * Build a case.drafted DispatchCandidate. `sessionId` is the open session's id
 * (carried as both session_id and correlation_id). event_id/ts are absent - the store
 * resolves them from its injected providers, so this stays pure. The whole case
 * (figures + assumptions) is carried; C9 upserts by opportunity_id.
 */
export function buildCaseDraftedCandidate(
  sessionId: string,
  casePayload: CasePayload,
): DispatchCandidate {
  return humanInk(sessionId, 'case.drafted', casePayload)
}
