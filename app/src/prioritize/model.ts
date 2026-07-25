// The PURE half of the Zone 6 (Prioritize) surface - every derivation
// PrioritizeZone.tsx needs, extracted so it is headless-testable under
// `node --test`. The .tsx stays presentational: it reads these derivations and
// renders. No React, no store - inputs are projected Opportunities (or the plain
// draft axis values from the score card), outputs are plain data.
//
// The split matters for the two-stage convergence (spec v0.3 A5): which candidates
// are scoreable at all (the Now pile), when a draft score is committable (both axes
// set, and different from what is already committed), and when the shortlist is
// healthy - all decided here, provable without a DOM.

import type { Opportunity, Score } from '@procezio/schema'

/** Stage 2 scores ONLY the Now pile - Maybe/No never reach the score cards. */
export function nowPileOf(opportunities: readonly Opportunity[]): Opportunity[] {
  return opportunities.filter((o) => o.triage === 'Now')
}

/** How many of the given (Now-pile) candidates carry a committed score. */
export function committedCountOf(opportunities: readonly Opportunity[]): number {
  return opportunities.filter((o) => o.committed === true).length
}

/**
 * The shortlist health target: at least this many committed scores make a healthy
 * shortlist (one idea is a bet, three is a portfolio). Guidance only - never a gate.
 */
export const SHORTLIST_TARGET = 3

/** Is the shortlist healthy yet (committed count at or past the target)? */
export function isHealthyShortlist(committedCount: number): boolean {
  return committedCount >= SHORTLIST_TARGET
}

/**
 * Decision journal (G3): the triage_reason value to save for a blur of the reason
 * input, or null when nothing should be written (the trimmed text matches what is
 * already stored - an unchanged blur must not emit an event).
 */
export function triageReasonPatch(current: Opportunity, raw: string): string | null {
  const next = raw.trim()
  return next === (current.triage_reason ?? '') ? null : next
}

/**
 * The committable Score from the two draft axes, or null while either axis is
 * unset. Commit is reachable only through a non-null result, so an incomplete
 * draft can never fire score.committed.
 */
export function completedScore(benefit: number | null, effort: number | null): Score | null {
  if (benefit === null || effort === null) return null
  return { benefit, effort }
}

/**
 * Does the draft differ from what is committed? An uncommitted candidate is always
 * dirty (its first commit is pending); a committed one is dirty only when an axis
 * moved - Re-commit stays disabled while the draft matches the committed score.
 */
export function isScoreDirty(
  opportunity: Opportunity,
  benefit: number | null,
  effort: number | null,
): boolean {
  return (
    opportunity.committed !== true ||
    benefit !== opportunity.score?.benefit ||
    effort !== opportunity.score?.effort
  )
}
