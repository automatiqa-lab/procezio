// M2-09 - the app-boundary event builders for the Zone 6 (Prioritize) surface.
//
// The PURE, isomorphic half of the Prioritize zone. Zone 6 is the convergent half of
// the divergent/convergent split and carries the SIGNATURE mechanic: anti-anchoring.
// Two distinct writes happen here, and the split matters:
//
//   1. Triage + rung are UPSERTS of the whole Opportunity (opportunity.created,
//      merged by id). They are pre-judgment metadata (which pile, which taxonomy
//      rung) and carry no committed score.
//   2. Scoring is its OWN event (score.committed) - the anti-anchoring trigger. The
//      user sets benefit+effort 1-5 and commits; ONLY THEN does score.committed fire,
//      and only then may a zone-6 agent rule react (rule when: score.committed). The
//      agent is silent on scores until this event exists (spec v0.2 section 9, the
//      hard rule). No score commentary is possible pre-commit because there is no
//      pre-commit score event to react to - the separation is structural, not a
//      convention.
//
// Pure candidate builders like every zone's events.ts - see store/envelope.ts for the
// canonical purity/layering explanation. C9 folds them: opportunity.created upserts by
// id; score.committed merges score+committed onto the matching opportunity.

import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
import type { Opportunity, Quadrant, Score, TaxonomyRung } from '@procezio/schema'

/** The three triage piles (spec v0.3 A5), fast and gut-level before any numbers. */
export const TRIAGE_PILES = ['Now', 'Maybe', 'No'] as const
export type TriagePile = (typeof TRIAGE_PILES)[number]

/** The 1-5 rank-only score values, shown as segmented buttons per axis. */
export const SCORE_VALUES = [1, 2, 3, 4, 5] as const

/**
 * The six benefit-taxonomy rungs (spec v0.2 section 8), one per shortlisted
 * opportunity, ordered least-to-most intervention. Typed against the imported
 * TaxonomyRung union via satisfies so it cannot drift from the schema.
 */
export const TAXONOMY_RUNGS = [
  'Remove',
  'Standardize',
  'Connect',
  'Automate',
  'Assist',
  'Delegate',
] as const satisfies readonly TaxonomyRung[]

/** One-line gloss per rung, so a no-code user reads meaning, not jargon. */
export const RUNG_HELP = {
  Remove: 'stop doing the step entirely',
  Standardize: 'make everyone do it one agreed way',
  Connect: 'let two systems talk so no one re-keys',
  Automate: 'a machine runs the whole step',
  Assist: 'a machine drafts, a person approves',
  Delegate: 'hand it to a cheaper/closer owner',
} as const satisfies Record<TaxonomyRung, string>

/** The score threshold splitting the 2x2 - above the midpoint of the 1-5 scale. */
const HIGH = 3

/**
 * Derive the 2x2 placement from a committed score (spec v0.2 section 9). Pure, so the
 * view can render the quadrant badge without persisting it: benefit high + effort low
 * is a Quick Win, and so on. High = strictly above the scale midpoint (4-5).
 */
export function quadrantFor(score: Score): Quadrant {
  const highBenefit = score.benefit > HIGH
  const lowEffort = score.effort <= HIGH
  if (highBenefit && lowEffort) return 'Quick Win'
  if (highBenefit && !lowEffort) return 'Strategic'
  if (!highBenefit && lowEffort) return 'Fill-in'
  return 'Avoid'
}

/**
 * Build an opportunity.created candidate that MERGES a patch onto an existing
 * Opportunity (upsert by id). Used for triage and rung, which must not drop the
 * candidate's other fields (title, an already-committed score). The caller passes the
 * current Opportunity and the fields to change; this spreads them so the projection's
 * whole-object upsert preserves everything else.
 */
export function buildOpportunityUpsertCandidate(
  sessionId: string,
  current: Opportunity,
  patch: Partial<Pick<Opportunity, 'triage' | 'rung' | 'triage_reason'>>,
): DispatchCandidate {
  const merged: Opportunity = { ...current, ...patch }
  return humanInk(sessionId, 'opportunity.created', { opportunity: merged })
}

/**
 * Build the score.committed candidate - the anti-anchoring trigger. Carries only the
 * opportunity id and the 1-5 score; C9 merges score+committed:true onto the matching
 * opportunity (never replacing its triage/rung/title). This is a SEPARATE event from
 * the upsert on purpose: zone-6 agent rules fire on exactly this type and nothing
 * earlier, so the agent cannot comment on a score before the user commits it.
 */
export function buildScoreCommittedCandidate(
  sessionId: string,
  opportunityId: string,
  score: Score,
): DispatchCandidate {
  return humanInk(sessionId, 'score.committed', { opportunity_id: opportunityId, score })
}
