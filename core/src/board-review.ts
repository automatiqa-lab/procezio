// v0.4 board-review pass (spec 01b section 11, Wave 2 E6): the Auditor re-reads the case as a
// target authority BEFORE it is shared. The DETERMINISTIC half lives here - the inconsistency
// flags a careful reviewer would raise, read straight from the canvas with no LLM. The generative
// half (the likely questions a board would ask) is worded separately by the agent; this decides
// WHAT is inconsistent, the model only phrases anticipated questions.
//
// Pure and isomorphic: canvas in, flags out. No clock, no randomness, no I/O.

import type { Canvas } from '@procezio/schema'
// The one blank-field predicate: "a figure with no source" must mean the same thing here
// as it does to the export gate (see the note on `blank` in credibility.ts).
import { blank } from './credibility.js'

/** One inconsistency a reviewer would catch. Ordered stably (by opportunity, then figure). */
export interface BoardReviewFlag {
  opportunity_id: string
  message: string
}

/**
 * The inconsistency flags across every drafted case. Deterministic reviewer checks:
 *  - a capacity-release benefit with no named redeployment owner (freed hours are not savings);
 *  - a figure with no source (every figure must trace);
 *  - a case that carries only costs or only benefits (a one-sided case is not decision-ready);
 *  - a benefit figure whose value names money but is classed capacity-release (savings confusion).
 * Empty result = the cases read consistently.
 */
export function boardReviewFlags(canvas: Canvas): BoardReviewFlag[] {
  const flags: BoardReviewFlag[] = []
  for (const c of canvas.cases ?? []) {
    const figures = c.figures ?? []
    let hasCost = false
    let hasBenefit = false
    for (const f of figures) {
      if (f.kind === 'cost') hasCost = true
      if (f.kind === 'benefit') hasBenefit = true
      if (blank(f.source_ref)) {
        flags.push({
          opportunity_id: c.opportunity_id,
          message: `Figure "${f.label}" has no source.`,
        })
      }
      if (f.benefit_class === 'capacity-release' && blank(f.redeployment_owner)) {
        flags.push({
          opportunity_id: c.opportunity_id,
          message: `"${f.label}" is capacity-release but names no redeployment owner - freed hours are not savings.`,
        })
      }
    }
    // Only genuinely one-sided when EXACTLY one side is present (XOR). If neither figure is
    // classed, that is an untagged-figures problem, not a one-sided case - flag it as its own.
    if (figures.length > 0 && hasCost !== hasBenefit) {
      flags.push({
        opportunity_id: c.opportunity_id,
        message: `The case carries only ${hasCost ? 'costs' : 'benefits'} - a board expects both sides.`,
      })
    } else if (figures.length > 0 && !hasCost && !hasBenefit) {
      flags.push({
        opportunity_id: c.opportunity_id,
        message: 'No figure is classed as cost or benefit - a board cannot weigh the case.',
      })
    }
  }
  return flags
}
