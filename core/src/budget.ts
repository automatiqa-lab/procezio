// C14 - the interjection budget ledger and per-commit cooldown gate for
// @procezio/core.
//
// This module sits ON TOP of C12's rule engine (rule-engine.ts): evaluate() has
// already decided WHICH rules fired and minted RuleFiredEventCandidate[]; this
// module decides WHICH of those firings are actually allowed to reach
// orchestration, given a deterministic budget and cooldown policy. It never
// re-runs rule matching (that stays C12's job) and it never words a message (a
// later LLM task). It is the second half of the deterministic control plane
// (constitution p10 / AGENTS.md one rule): rules + budget decide WHETHER; the LLM
// only ever decides HOW to word an allowed firing.
//
// Purity + determinism (the milestone-1-exit invariant): every count is a pure
// FOLD over the event log slice handed in - budget windows over prior
// `budget.spent` events, cooldowns over prior `rule.fired` events. There is no
// mutable global ledger, no Date.now, no Math.random, no I/O, no node:* import.
// All time is injected via event `ts` (ISO 8601) and reduced with arithmetic on
// parsed epoch-ms values only. Replaying the identical (candidates, priorEvents,
// config, context) therefore yields byte-identical allowed/suppressed/budget
// output - which is the determinism criterion this card must prove.
//
// Zone context seam: neither Rule nor RuleFiredPayload carries a zone_id and the
// schema is frozen for this card (schemaTouched:false), so the ledger cannot
// itself know which zone a firing belongs to. The caller (the orchestration loop,
// a later card) injects that via a `zoneOf(candidate)` resolver - the same shape
// of caller-supplied seam C12 uses for identity/clock.

// Shared contract types come from the ratified schema (C7), never redefined here,
// so the events this ledger reads and mints cannot drift from what the event
// store (C8) validates against. BudgetPayload is the budget.* payload family;
// RuleFiredPayload lets us read a fired candidate's rule_id without a parallel copy.
import type { Author, BudgetPayload, EventEnvelope, RuleFiredPayload, Uuid } from '@procezio/schema'
// The candidate shape and Rule come from C12; imported (not redefined) so the two
// modules share one definition of a fired-rule candidate and a rule's cooldown.
import type { Rule, RuleFiredEventCandidate } from './rule-engine.js'

// --- Deterministic ISO8601 -> epoch ms ---------------------------------------

/**
 * Parse an ISO 8601 timestamp to epoch milliseconds. Date.parse is a PURE,
 * deterministic function of its input string (no clock, no RNG); it is the
 * "parse the date value, then do arithmetic" primitive the card calls for. NaN
 * (an unparseable ts) is treated as out-of-window / non-triggering by every
 * caller, so a malformed timestamp can never fabricate a spend or a block.
 */
function parseIso(ts: string): number {
  return Date.parse(ts)
}

// --- Budget config ------------------------------------------------------------

/**
 * The interjection budget policy. `windowMs` is the rolling-window length used
 * for the (asOf - windowMs, asOf] fold; `maxFirings` is how many firings a single
 * zone may spend inside that window; `window` is the audit label stored verbatim
 * on every minted budget.spent payload (BudgetPayload.window). All three are data
 * - the ledger reads them, never a clock.
 */
export interface BudgetConfig {
  /** Rolling-window length in milliseconds. */
  windowMs: number
  /** Maximum firings allowed per zone per rolling window. */
  maxFirings: number
  /** Audit label for the window, copied verbatim onto budget.spent payloads. */
  window: string
}

/**
 * Card default: at most 2 firings per zone per 10-minute rolling window. Callers
 * may pass their own BudgetConfig; this is only the out-of-the-box policy.
 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  windowMs: 600_000,
  maxFirings: 2,
  window: 'PT10M',
}

// --- budget.spent candidate ---------------------------------------------------

/**
 * A `budget.spent` event candidate: a full EventEnvelope MINUS `seq` (the event
 * store is the sole authority on seq), with the payload narrowed to the ratified
 * BudgetPayload family. Locally derived from EventEnvelope, exactly as
 * RuleFiredEventCandidate is in C12, so this module stays decoupled from the store.
 */
export type BudgetSpentEventCandidate = Omit<EventEnvelope, 'seq' | 'payload'> & {
  payload: BudgetPayload
}

// --- Pure folds ---------------------------------------------------------------

/**
 * Total budget spent in one zone within the half-open rolling window
 * `(asOf - windowMs, asOf]`, computed as a PURE FOLD over prior `budget.spent`
 * events. Lower bound exclusive, upper bound inclusive, so a spend exactly
 * `windowMs` old has just rolled out of the window and a spend at `asOf` counts.
 *
 * The input is typed to the minimal fields read (type/payload/ts) so BOTH stored
 * EventEnvelopes AND freshly-minted BudgetSpentEventCandidates can be folded
 * together in one call - which is what lets enforce() catch a 3rd firing WITHIN a
 * single evaluation batch, not only across batches. No mutable state: the count is
 * re-derived from the slice every call, so folding the same slice is idempotent.
 */
export function budgetSpent(
  budgetEvents: readonly Pick<EventEnvelope, 'type' | 'payload' | 'ts'>[],
  zoneId: number,
  asOfTs: string,
  windowMs: number,
): number {
  const asOf = parseIso(asOfTs)
  if (Number.isNaN(asOf)) return 0
  const lower = asOf - windowMs
  let sum = 0
  for (const e of budgetEvents) {
    if (e.type !== 'budget.spent') continue
    const p = e.payload as BudgetPayload
    if (p.zone_id !== zoneId) continue
    const t = parseIso(e.ts)
    if (Number.isNaN(t)) continue
    // Half-open window: (lower, asOf]. Exclusive lower = a spend exactly windowMs
    // old has aged out; inclusive upper = a spend at asOf is inside the window.
    if (t > lower && t <= asOf) sum += p.spent
  }
  return sum
}

/**
 * Whether a `per_commit` rule has already fired for this correlation id, computed
 * as a PURE FOLD over prior `rule.fired` events (never a wall-clock timer). The
 * correlation id is the natural per-commit / per-opportunity key already on every
 * envelope (specs/02 s.4), so a per_commit rule fires at most once per commit with
 * no new schema field. The input is the minimal read shape (type/payload/
 * correlation_id) so prior stored events AND already-allowed candidates from the
 * current batch fold together - blocking a duplicate within one batch too.
 */
export function cooldownBlocked(
  firedEvents: readonly Pick<EventEnvelope, 'type' | 'payload' | 'correlation_id'>[],
  ruleId: string,
  correlationId: string,
): boolean {
  return firedEvents.some(
    (e) =>
      e.type === 'rule.fired' &&
      e.correlation_id === correlationId &&
      (e.payload as RuleFiredPayload).rule_id === ruleId,
  )
}

// --- Enforcement context + result --------------------------------------------

/**
 * The envelope fields the ledger cannot deterministically invent when it mints a
 * budget.spent event, injected by the caller - mirroring C12's EvaluateContext so
 * this module, like the rule engine, never touches a clock or an RNG. session_id,
 * correlation_id and schema_version are NOT here: they are copied from the firing
 * the spend records, because a budget.spent is caused by (and belongs to) that
 * exact firing.
 */
export interface EnforcementContext {
  /** Identity of the agent that authors the minted budget.spent events. */
  agentId: string
  /** Optional model ref for the authoring agent. */
  modelRef?: string
  /** Caller-supplied, deterministic event id for the Nth minted budget.spent. */
  budgetEventId: (firing: RuleFiredEventCandidate, index: number) => Uuid
}

/**
 * The outcome of enforcing budget + cooldown over one batch of fired candidates.
 * `allowed` are the firings that passed and may reach orchestration; `suppressed`
 * are dropped here and structurally never reach the caller's orchestration path;
 * `budgetEvents` is the audit trail - one budget.spent per allowed firing, each
 * caused by (created logically AFTER) its firing.
 */
export interface EnforceResult {
  allowed: RuleFiredEventCandidate[]
  suppressed: RuleFiredEventCandidate[]
  budgetEvents: BudgetSpentEventCandidate[]
}

// --- enforce ------------------------------------------------------------------

/**
 * Mint the budget.spent candidate that records one allowed firing's spend. Born
 * pencil (agent-authored, two-ink rule p5 - the store re-derives this from
 * author.kind on append, so we set it consistently, not authoritatively) and
 * caused by the firing it records, so the "budget.spent created AFTER rule.fired"
 * ordering is encoded in the causation edge, not merely in array position.
 */
function makeBudgetCandidate(
  firing: RuleFiredEventCandidate,
  zoneId: number,
  config: BudgetConfig,
  context: EnforcementContext,
  index: number,
): BudgetSpentEventCandidate {
  const author: Author = {
    kind: 'agent',
    id: context.agentId,
    ...(context.modelRef !== undefined ? { model_ref: context.modelRef } : {}),
  }
  const payload: BudgetPayload = {
    zone_id: zoneId,
    spent: 1,
    window: config.window,
  }
  return {
    event_id: context.budgetEventId(firing, index),
    session_id: firing.session_id,
    type: 'budget.spent',
    author,
    provenance: { state: 'pencil', accepted_by: null, accepted_at: null },
    payload,
    // The firing caused this spend (deterministic, from input).
    causation_id: firing.event_id,
    correlation_id: firing.correlation_id,
    compensates: null,
    schema_version: firing.schema_version,
    // Spend is recorded at the firing's own timestamp, so window arithmetic stays
    // coherent regardless of how the caller batches ticks. No clock is read.
    ts: firing.ts,
  }
}

/**
 * Enforce cooldown + budget over the fired candidates C12 already produced, in
 * order, returning the allowed firings, the suppressed ones, and the budget.spent
 * audit events for the allowed firings.
 *
 * For each candidate, in ruleset order:
 *   1. Cooldown gate (per_commit rules only): folds prior `rule.fired` events PLUS
 *      the firings already allowed in this batch, keyed by correlation_id. A
 *      per_commit rule that already fired for this correlation is suppressed.
 *   2. Budget gate: resolves the candidate's zone via the injected `zoneOf`, folds
 *      prior `budget.spent` events PLUS the budget.spent already synthesized in
 *      this batch over the rolling window ending at the firing's ts, and suppresses
 *      the firing if allowing it would exceed config.maxFirings for that zone. So a
 *      3rd firing in a zone's window is suppressed whether the first two are in the
 *      prior log or earlier in this same batch.
 *
 * A suppressed candidate is DROPPED - it is returned only in `suppressed` for
 * audit and never appears in `allowed`, so "blocked from reaching orchestration"
 * holds structurally, not via a downstream filter. An allowed candidate records a
 * budget.spent created after it (causation edge). Zero mutable global state: every
 * count is re-derived from the slice handed in, so enforce() over the same inputs
 * is idempotent and replay-safe. No clock, no RNG - all time is the events' ts.
 */
export function enforce(
  candidates: readonly RuleFiredEventCandidate[],
  rulesById: ReadonlyMap<string, Rule>,
  zoneOf: (candidate: RuleFiredEventCandidate) => number,
  priorEvents: readonly EventEnvelope[],
  config: BudgetConfig,
  context: EnforcementContext,
): EnforceResult {
  const allowed: RuleFiredEventCandidate[] = []
  const suppressed: RuleFiredEventCandidate[] = []
  const budgetEvents: BudgetSpentEventCandidate[] = []

  for (const cand of candidates) {
    const ruleId = cand.payload.rule_id
    const rule = rulesById.get(ruleId)

    // 1. Cooldown gate (per_commit): fold prior rule.fired + this batch's allowed.
    if (rule?.cooldown === 'per_commit') {
      if (cooldownBlocked([...priorEvents, ...allowed], ruleId, cand.correlation_id)) {
        suppressed.push(cand)
        continue
      }
    }

    // 2. Budget gate: fold prior budget.spent + this batch's synthesized spend.
    const zoneId = zoneOf(cand)
    const priorSpend = budgetSpent(
      [...priorEvents, ...budgetEvents],
      zoneId,
      cand.ts,
      config.windowMs,
    )
    if (priorSpend + 1 > config.maxFirings) {
      suppressed.push(cand)
      continue
    }

    // Allowed: record the firing, THEN mint the budget.spent that records its spend.
    allowed.push(cand)
    budgetEvents.push(makeBudgetCandidate(cand, zoneId, config, context, budgetEvents.length))
  }

  return { allowed, suppressed, budgetEvents }
}
