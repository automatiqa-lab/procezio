// v0.4 - the credibility system: ladder + export gate (spec 01b section 8, D1/D3/D4).
//
// The moat, as deterministic functions. credibilityLadder reads how far the session has been
// pushed toward evidence; exportBlockers is the named-source gate - the honest list of reasons
// the improvement case is not yet exportable. Both are pure views over the Canvas: no LLM, no
// clock. The agent (Auditor) later voices these, but the decision of what blocks is made here.
//
// Wave 1 computes L1 (draft from memory) and L2 (friction-hunted + data-audited). L3
// (doer-verified) and L4 (independently reviewed) need doer/reviewer markers that are
// fast-follow, so the ladder tops out at L2 for now and a case may never claim "decision-ready"
// (below L3 it is a "draft for verification") - the honest ceiling, enforced.

import type { Canvas, Provenance } from '@procezio/schema'

export type CredibilityLevel = 1 | 2 | 3 | 4

export interface Credibility {
  level: CredibilityLevel
  label: string
  /** Only L3+ may claim "decision-ready"; below that the output is "draft for verification". */
  decisionReady: boolean
  claim: string
}

const LADDER_LABELS: Record<CredibilityLevel, string> = {
  1: 'draft from memory',
  2: 'friction-hunted and data-audited',
  3: 'doer-verified',
  4: 'independently reviewed',
}

/**
 * True when an optional free-text field is effectively empty. Exported (module-level, not
 * part of the public core API) because "a figure with no source_ref" must mean exactly the
 * same thing to the export gate here and to the board-review pass (board-review.ts) - one
 * predicate, two consumers, no drift.
 */
export const blank = (s: string | undefined): boolean => (s ?? '').trim().length === 0

/**
 * Where on the credibility ladder the session sits, derived from what evidence work is done.
 *
 * When `provenance` is supplied (the C10 provenanceOf projection, keyed like
 * "friction:<id>" / "audit_tag:<id>"), PENCIL evidence does not count: an agent
 * suggestion the human has not yet accepted is not friction-hunting or data-auditing
 * the human did, and claiming L2 on its back would be the exact overclaim the ladder
 * exists to prevent. Without provenance the old canvas-only behavior is kept (callers
 * that only hold a canvas, e.g. session-diff, stay valid).
 */
export function credibilityLadder(
  canvas: Canvas,
  provenance?: ReadonlyMap<string, Provenance>,
): Credibility {
  const counted = (key: string): boolean =>
    provenance === undefined || provenance.get(key)?.state !== 'pencil'
  const hasMap = (canvas.nodes?.length ?? 0) > 0
  const frictionHunted = (canvas.friction ?? []).some((f) => counted(`friction:${f.id}`))
  const dataAudited = (canvas.audit_tags ?? []).some((a) => counted(`audit_tag:${a.id}`))

  // L2 requires a real map plus both understand-phase evidence passes. L3/L4 are fast-follow.
  const level: CredibilityLevel = hasMap && frictionHunted && dataAudited ? 2 : 1
  const decisionReady = level >= 3
  return {
    level,
    label: LADDER_LABELS[level],
    decisionReady,
    claim: decisionReady ? 'decision-ready' : 'draft for verification',
  }
}

/**
 * The export gate (D3): the named-source reasons the case cannot yet be exported. An assumption
 * flagged low-confidence with no verify-by is unacknowledged and blocks; a case figure with no
 * source blocks. An empty list means the case is exportable. The list is stable-ordered
 * (assumptions in ledger order, then figures in case order).
 */
export function exportBlockers(canvas: Canvas): string[] {
  const blockers: string[] = []

  for (const a of canvas.assumptions ?? []) {
    if (a.confidence === 'low' && blank(a.verify_by)) {
      blockers.push(
        `Unacknowledged assumption: "${a.statement}" - name who verifies it, or raise its confidence.`,
      )
    }
  }

  for (const c of canvas.cases ?? []) {
    for (const f of c.figures ?? []) {
      if (blank(f.source_ref)) {
        blockers.push(
          `Figure "${f.label}" has no source - every figure in the case must be sourced.`,
        )
      }
    }
  }

  // Wave 2 B4: a simulated stakeholder view is rehearsal, not verification. Any unconfirmed one
  // must be acknowledged before export - confirm it with the real stakeholder, or mark it noted.
  const unconfirmed = (canvas.simulated_perspectives ?? []).filter((s) => s.confirmed !== true)
  if (unconfirmed.length > 0) {
    blockers.push(
      `${unconfirmed.length} simulated perspective${unconfirmed.length === 1 ? '' : 's'} unconfirmed - confirm with the real stakeholder before export, or mark as noted.`,
    )
  }

  return blockers
}

/** True when nothing blocks export (the named-source gate is clear). */
export function canExport(canvas: Canvas): boolean {
  return exportBlockers(canvas).length === 0
}
