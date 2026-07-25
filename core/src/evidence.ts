// v0.4 evidence-binding status (spec 01b Wave 3 D7): evidence-backed vs asserted-only.
//
// A claim carries more weight when it is backed by a concrete artifact, not just asserted. This
// pure view splits the assumption ledger into the entries that reference evidence and those that
// are asserted-only, so the output (one-pager / board review) can be honest about how much of the
// case actually stands on proof. The artifact itself stays local; only the reference is stored.

import type { Canvas } from '@procezio/schema'

export interface EvidenceStatus {
  /** Assumptions that reference a concrete artifact. */
  backed: number
  /** Assumptions with no evidence reference (asserted-only). */
  asserted: number
}

/** Count evidence-backed vs asserted-only assumptions in the ledger. */
export function evidenceStatus(canvas: Canvas): EvidenceStatus {
  let backed = 0
  let asserted = 0
  for (const a of canvas.assumptions ?? []) {
    if ((a.evidence ?? '').trim().length > 0) backed += 1
    else asserted += 1
  }
  return { backed, asserted }
}
