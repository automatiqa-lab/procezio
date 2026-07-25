// M2-13 - the deterministic nudge layer: derive active agent nudges from the log.
//
// The layering principle (constitution p10): versioned RULES decide
// WHETHER the agent reacts; the LLM later decides HOW to word it. This module is the
// deterministic half - it reads which rules fired (rule.fired events, already in the
// event log, authored by the C12 engine) and turns them into displayable nudges,
// using each rule's stored message_template VERBATIM. When the slim LLM client lands
// (last per the build order), the wording step replaces the raw template; the decision
// to fire never moves out of the rules.
//
// Pure + isomorphic: no node:*, no clock, no RNG. Every function is a pure function of
// its inputs and runs headless under `node --test`.

import type { EventEnvelope, Ruleset } from '@procezio/core'
import type { RuleFiredPayload } from '@procezio/schema'

/** A displayable agent nudge, resolved from a rule.fired event + its rule. */
export interface Nudge {
  /** The rule that fired (stable across repeats - one active nudge per rule). */
  rule_id: string
  severity: RuleFiredPayload['severity']
  /** The rule's message_template, verbatim (LLM wording is a later step). */
  message: string
  /** The interjection budget bucket this nudge counts against, if any. */
  budget_class?: string
}

/** Capability tiers T0..T3 (spec/02b). Higher tiers unlock richer agent behaviors. */
const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'] as const

/**
 * Does the current capability tier meet a rule's min_tier? A rule with no min_tier is
 * always eligible (T0). Without the LLM the app runs at T0, so a T1 challenge (e.g. the
 * zone-6 anti-anchoring challenge, which needs the model to word evidence) does NOT
 * fire yet - it lights up once the LLM client raises the tier. Unknown tiers are
 * treated as unmet (fail closed).
 */
export function meetsTier(minTier: string | undefined, currentTier: string): boolean {
  if (minTier === undefined) return true
  const need = TIER_ORDER.indexOf(minTier as (typeof TIER_ORDER)[number])
  const have = TIER_ORDER.indexOf(currentTier as (typeof TIER_ORDER)[number])
  if (need === -1 || have === -1) return false
  return have >= need
}

/**
 * The maximum active nudges per budget_class (spec interjection budget: max 2 per zone
 * per window). The full 10-minute window needs the wall clock and lands with the agent
 * task layer; here the cap is a per-session ceiling per class, which is stricter and
 * deterministic.
 */
export const BUDGET_PER_CLASS = 2

/**
 * Has rule `ruleId` already fired in this log? Its rule.fired event is the cooldown
 * record: a rule fires at most once while its firing stands (dismissal is tracked
 * separately, in UI state), so the log never fills with duplicate nudges.
 */
export function hasFired(log: readonly EventEnvelope[], ruleId: string): boolean {
  return log.some(
    (e) => e.type === 'rule.fired' && (e.payload as RuleFiredPayload).rule_id === ruleId,
  )
}

/** Count active (fired-and-not-dismissed) nudges in a budget_class. */
export function activeCountForClass(
  log: readonly EventEnvelope[],
  dismissed: ReadonlySet<string>,
  budgetClass: string,
): number {
  const seen = new Set<string>()
  for (const e of log) {
    if (e.type !== 'rule.fired') continue
    const p = e.payload as RuleFiredPayload
    if (p.budget_class === budgetClass && !dismissed.has(p.rule_id)) seen.add(p.rule_id)
  }
  return seen.size
}

/**
 * Derive the active nudges to show: every rule.fired in the log, deduped by rule_id
 * (one nudge per rule, first firing wins), minus the dismissed ones, resolved to its
 * rule's message_template + severity. Rules missing from the ruleset (stale log) are
 * skipped. Order follows first-firing order in the log (deterministic).
 */
export function computeActiveNudges(
  log: readonly EventEnvelope[],
  ruleset: Ruleset,
  dismissed: ReadonlySet<string>,
): Nudge[] {
  const byId = new Map(ruleset.rules.map((r) => [r.id, r]))
  const out: Nudge[] = []
  const seen = new Set<string>()
  for (const e of log) {
    if (e.type !== 'rule.fired') continue
    const p = e.payload as RuleFiredPayload
    if (seen.has(p.rule_id) || dismissed.has(p.rule_id)) continue
    const rule = byId.get(p.rule_id)
    if (rule === undefined) continue
    seen.add(p.rule_id)
    out.push({
      rule_id: p.rule_id,
      severity: p.severity,
      message: rule.message_template ?? '',
      ...(rule.budget_class !== undefined ? { budget_class: rule.budget_class } : {}),
    })
  }
  return out
}
