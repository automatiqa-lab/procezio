// The Challenger's escalation ladder - a deterministic rung, not an LLM decision.
//
// Spec v0.4 section 5 (decision B3): the Challenger wakes only after a commitment, and it
// escalates across repeated commitments on the SAME opportunity - a gentle Probe first, a
// firmer Alert, then a direct Challenge, and no higher. Which rung fires is methodology (the
// control plane decides), so it lives here as a pure function of how many challenges have
// already been issued for that opportunity. The LLM only words the rung it is handed; it never
// picks the temperature and never decides whether to speak (layering principle).

/** The Challenger's three escalation rungs, gentlest first. */
export type ChallengeTier = 'probe' | 'alert' | 'challenge'

/** The ladder, in order - index 0 is the first (gentlest) rung. */
export const CHALLENGE_LADDER: readonly ChallengeTier[] = ['probe', 'alert', 'challenge']

/**
 * The rung to fire for the NEXT challenge on an opportunity, given how many have already been
 * issued for it (0 -> probe, 1 -> alert, 2+ -> challenge, and never past challenge). A negative
 * count is treated as 0, so a caller cannot escalate below the first rung.
 */
export function challengeTier(priorCount: number): ChallengeTier {
  const i = Math.max(0, Math.floor(priorCount))
  return CHALLENGE_LADDER[Math.min(i, CHALLENGE_LADDER.length - 1)]!
}
