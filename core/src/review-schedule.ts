// v0.4 re-assessment scheduler (spec 01b Wave 3 G4): when to re-check this process.
//
// SM-2-inspired, but a process is not a flashcard: the interval expands with each pass yet is
// MODULATED by ledger confidence volatility - a case resting on many gut-feel assumptions should be
// re-checked sooner than one whose figures are verified. Pure and deterministic: it returns a
// number of DAYS (not an absolute date - the isomorphic core reads no clock), and the reason.

import type { Canvas } from '@procezio/schema'

export interface ReviewSchedule {
  /** Suggested days until the next re-assessment. */
  days: number
  /** Why - so the number is never a black box. */
  reason: string
}

const BASE_DAYS = 30 // the interval for a rock-solid, fully-verified ledger
const MIN_EASE = 1.3
const MAX_EASE = 2.5

/**
 * Suggest the interval to the next re-assessment. `pass` is how many times this process has been
 * reviewed before (0 = first ever), so the interval expands SM-2-style; the ease factor is set by
 * the share of low-confidence assumptions in the ledger (more gut-feel -> smaller ease -> sooner).
 */
export function reviewSchedule(canvas: Canvas, pass = 0): ReviewSchedule {
  const assumptions = canvas.assumptions ?? []
  const low = assumptions.filter((a) => a.confidence === 'low').length
  const volatility = assumptions.length === 0 ? 0.3 : low / assumptions.length // no ledger = mildly unsure
  const ease = MAX_EASE - (MAX_EASE - MIN_EASE) * volatility // 2.5 stable ... 1.3 all gut-feel
  // SM-2 expansion: first pass is a short check; later passes grow by the ease factor.
  const p = Math.max(0, Math.floor(pass))
  const raw =
    p === 0 ? 7 : Math.round(BASE_DAYS * Math.pow(ease / MAX_EASE, 1) * Math.pow(ease, p - 1))
  const days = Math.max(3, Math.min(365, raw))
  const pct = Math.round(volatility * 100)
  const reason =
    assumptions.length === 0
      ? 'No ledger yet - a short first re-check.'
      : `${pct}% of your assumptions are gut-feel; a ${volatility > 0.5 ? 'volatile' : 'steady'} ledger re-checks ${volatility > 0.5 ? 'sooner' : 'later'}.`
  return { days, reason }
}
