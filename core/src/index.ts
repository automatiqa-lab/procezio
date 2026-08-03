// @procezio/core - isomorphic TypeScript engine: event store, projections, rule
// engine, timers/budget, slim LLM client, schema validation. Written once, runs
// in browser and Node. Built from scratch (no frameworks) per the constitution,
// in card order C8 onward.
export { createEventStore } from './event-store.js'
export type { EventStore, EventEnvelope, EventCandidate, AppendResult } from './event-store.js'

// C9 - projection layer: pure deterministic fold of the event log into canvas
// state, plus the disposable-snapshot cache. C10 adds provenanceOf: the two-ink
// provenance projection over the same log.
export { project, takeSnapshot, loadFromSnapshot, provenanceOf } from './projection.js'
export type { Snapshot, ProjectionOptions } from './projection.js'

// v0.4 - the presentation-stream projection: folds the separate geometry log (node/frame
// positions) into a disposable PresentationState, never touching the methodology Canvas or
// provenance. "Position is presentation, connections are semantics."
export { projectPresentation } from './presentation.js'

// v0.4 - zone completeness as named missing items (never percentages): a pure derived view
// over the Canvas that powers the zone rail and the Auditor's gap probes.
export { zoneCompleteness } from './completeness.js'

// v0.4 A3 - the "recalculating" GPS agent: a soft reroute message when you jump ahead of an
// unfinished earlier zone. Never blocks; returns a nudge string or null.
export { recalcRoute } from './recalc.js'
export type { ZoneCompleteness } from './completeness.js'

// v0.4 - deterministic map analysis: handoff count + HD-2 Connect detection (structural, no
// LLM). The exact metrics that read the shape of the process alone.
export { handoffCount, connectCandidates } from './estimator.js'
export type { ConnectCandidate } from './estimator.js'
// v0.4 F1 - the time half of the what-if estimator: parse tagged durations and fold them into a
// cycle-time estimate + the biggest wait. Always an estimate, never a measurement.
export { parseDuration, cycleTimeEstimate, formatDuration } from './estimator.js'
export type { CycleTimeEstimate } from './estimator.js'

// v0.4 - the target-state composer: deterministic rung transforms build a pencil to-be Canvas
// + the changes + the handoff delta. The LLM only names what this decided (never the numbers
// or the structure).
export { composeToBe } from './composer.js'
export type { ToBeChange, ComposeResult } from './composer.js'

// v0.4 - the credibility system: the ladder (how far the session has been pushed toward
// evidence) and the named-source export gate (the honest reasons the case is not yet
// exportable). Pure views; the Auditor voices them, but what blocks is decided here.
export { credibilityLadder, exportBlockers, canExport } from './credibility.js'
export type { Credibility, CredibilityLevel } from './credibility.js'

// v0.4 E6 - the board-review pass: deterministic inconsistency flags a target authority would
// raise, read from the case with no LLM. The model only words the anticipated questions.
export { boardReviewFlags } from './board-review.js'
export type { BoardReviewFlag } from './board-review.js'

// v0.4 B9 - the Auditor's continuity check: deterministic contradictions across the map, ledger
// and case (dangling references, a committed idea with no score, a systems/data mismatch).
export { continuityChecks } from './continuity.js'
export type { ContinuityFlag } from './continuity.js'

// v0.4 D7 - evidence-binding status: how many ledger entries reference concrete proof vs are
// asserted-only. The artifact stays local; only the reference is stored.
export { evidenceStatus } from './evidence.js'
export type { EvidenceStatus } from './evidence.js'

// v0.4 F7 - the risk-prompt deck: deterministic risk heuristics dealt against the mapped steps
// (hidden chasing, rework loops, improvised steps, judgment decisions, multi-system steps).
export { riskPrompts } from './risk-deck.js'
export type { RiskPrompt } from './risk-deck.js'

// v0.4 G5 - re-assessment diff: what changed between a prior saved session and the current one
// (steps, ideas, commitments, friction, cases, credibility). A pure diff of two projected canvases.
export { sessionDiff } from './session-diff.js'
export type { SessionDiff } from './session-diff.js'

// v0.4 G4 - the re-assessment scheduler: an SM-2-style interval (in days) modulated by ledger
// confidence volatility. Returns days, never a clock-dependent date.
export { reviewSchedule } from './review-schedule.js'
export type { ReviewSchedule } from './review-schedule.js'

// v0.4 - the Challenger's escalation ladder. Which rung (probe/alert/challenge) fires is a
// deterministic function of prior challenges on an opportunity; the LLM only words the rung.
export { challengeTier, CHALLENGE_LADDER } from './challenger.js'
export type { ChallengeTier } from './challenger.js'

// C10 - compensating-event constructor: build the undo/redo event for any target.
export { createCompensatingEvent } from './compensate.js'
export type { CompensateOptions } from './compensate.js'

// C12 - declarative rule engine: the deterministic control plane. Matches a
// versioned ruleset against the projection + triggering event and emits rule.fired
// candidates. Zero eval/Function, zero LLM/network, pure and isomorphic. Budget/
// cooldown enforcement (C14) and message rendering are deferred, not done here.
export { evaluate, createRuleValidator, RULESET_JSON_SCHEMA } from './rule-engine.js'
export type {
  Rule,
  Ruleset,
  Predicate,
  LogicalOp,
  WhenCondition,
  EventTypePredicate,
  PathPredicate,
  PathOp,
  EvaluateContext,
  RuleFiredEventCandidate,
} from './rule-engine.js'

// C14 - interjection budget ledger + per-commit cooldown gate. Deterministic,
// pure folds over budget.*/rule.fired events; enforces "at most N firings per zone
// per rolling window" and "at most once per commit" on top of C12's candidates.
// Zero clock/RNG, isomorphic. This completes the milestone-1 rule engine.
export { budgetSpent, cooldownBlocked, enforce, DEFAULT_BUDGET_CONFIG } from './budget.js'
export type {
  BudgetConfig,
  EnforcementContext,
  EnforceResult,
  BudgetSpentEventCandidate,
} from './budget.js'

// C14 - idle/dwell timers: pure functions of injected timestamps that return a
// deterministic TimerTrigger the orchestration loop can feed back. No wall clock.
export { idleTriggered, dwellTriggered, evaluateIdleTimer, evaluateDwellTimer } from './timers.js'
export type { TimerKind, TimerTrigger, IdleTimerInput, DwellTimerInput } from './timers.js'

// C-LLM - the slim, fetch-based, transport-injected LLM client. The generative
// language surface: it words what the rules already decided, does schema-validated
// requests with bounded repair, probes a capability tier, and meters every call. No
// SDK, no ajv, CSP-safe.
export {
  createLlmClient,
  createFetchTransport,
  extractJson,
  DEFAULT_TIMEOUT_MS,
} from './llm-client.js'
export type {
  LlmClient,
  LlmClientOptions,
  LlmCallOptions,
  LlmConfig,
  LlmMessage,
  LlmTransport,
  LlmRequest,
  LlmMetering,
  CompletionResult,
  FetchTransportOptions,
  JsonResult,
  Tier,
  AuthStyle,
  SchemaValidator,
} from './llm-client.js'

// EU AI Act Art. 50 - the disclosure envelope and its per-format expressions (PNG text
// chunks, PDF info entries, XMP) plus the visible document line. Conditional (nothing
// drafted, nothing marked), idempotent, and it never names the model.
export {
  DISCLOSURE_SCHEMA,
  DISCLOSURE_SYSTEM,
  MODEL_RESPONSE_SCOPE,
  envelope,
  alreadyMarked,
  documentLine,
  pngTextChunks,
  pdfInfoEntries,
  xmp,
} from './disclosure.js'
export type {
  DisclosureEnvelope,
  DisclosureCount,
  DisclosureIdentity,
  DisclosureWording,
  EnvelopeInput,
  ReviewState,
} from './disclosure.js'
