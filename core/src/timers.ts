// C14 - idle and dwell timers for @procezio/core.
//
// These are the time-based triggers that let the deterministic control plane act
// on the PASSAGE of time (a stalled session, a zone dwelt on too long) without a
// wall clock. The trick that keeps them replay-deterministic: they are PURE
// FUNCTIONS of injected timestamps. The "current time" is not read from a clock -
// it is passed in as `asOfTs`, sourced by the caller from an event's `ts`. So the
// same (lastActivity, asOf, threshold) always yields the same decision, and a
// replayed event log reproduces the identical timer triggers.
//
// No Date.now, no Math.random, no I/O, no node:* import. Time is parsed from ISO
// 8601 and reduced with arithmetic on epoch-ms values only. The output is a plain
// data value (TimerTrigger), NOT a new EventEnvelope/EventType: the schema is
// frozen for this card (schemaTouched:false) and idle/dwell are not among the 15
// ratified event families. The orchestration loop (a later, out-of-scope card) is
// what turns a trigger into an event fed back into evaluate(); this module owns
// only the pure decision and its deterministic output shape.

/**
 * Parse an ISO 8601 timestamp to epoch milliseconds. Date.parse is a pure,
 * deterministic function of its input (no clock, no RNG). NaN (unparseable) is
 * treated as non-triggering by every caller, so a malformed ts never fires a timer.
 */
function parseIso(ts: string): number {
  return Date.parse(ts)
}

/** Which kind of time-based trigger fired. */
export type TimerKind = 'idle' | 'dwell'

/**
 * A deterministic timer trigger: plain data the orchestration loop can feed back
 * as a triggering event. `sinceTs` is the reference point (last activity for idle,
 * zone-entry for dwell), `asOfTs` is the injected "now", `elapsedMs` is their
 * difference. `zoneId` is present only for dwell (the zone dwelt on).
 */
export interface TimerTrigger {
  kind: TimerKind
  zoneId?: number
  sinceTs: string
  asOfTs: string
  elapsedMs: number
}

/** Inputs to the idle check: last activity, injected now, and the idle threshold. */
export interface IdleTimerInput {
  /** Timestamp of the most recent recorded activity (from an event ts). */
  lastActivityTs: string
  /** The injected "current" timestamp (from an event ts) - never a clock. */
  asOfTs: string
  /** Idle threshold X in milliseconds. */
  thresholdMs: number
}

/** Inputs to the dwell check: zone-entry time, injected now, and the dwell threshold. */
export interface DwellTimerInput {
  /** Timestamp the current zone was entered / last changed (from an event ts). */
  zoneEnteredTs: string
  /** The injected "current" timestamp (from an event ts) - never a clock. */
  asOfTs: string
  /** Dwell threshold Y in milliseconds. */
  thresholdMs: number
}

/**
 * Pure predicate: has there been NO activity for at least `thresholdMs`? True iff
 * `asOfTs - lastActivityTs >= thresholdMs`. Reads only injected timestamps; an
 * unparseable input is non-triggering (returns false), so the timer never fires on
 * bad data.
 */
export function idleTriggered(input: IdleTimerInput): boolean {
  const last = parseIso(input.lastActivityTs)
  const now = parseIso(input.asOfTs)
  if (Number.isNaN(last) || Number.isNaN(now)) return false
  return now - last >= input.thresholdMs
}

/**
 * Pure predicate: has the zone been unchanged for at least `thresholdMs`? True iff
 * `asOfTs - zoneEnteredTs >= thresholdMs`. Reads only injected timestamps; an
 * unparseable input is non-triggering (returns false).
 */
export function dwellTriggered(input: DwellTimerInput): boolean {
  const entered = parseIso(input.zoneEnteredTs)
  const now = parseIso(input.asOfTs)
  if (Number.isNaN(entered) || Number.isNaN(now)) return false
  return now - entered >= input.thresholdMs
}

/**
 * Evaluate the idle timer, returning a deterministic TimerTrigger when idle or
 * null otherwise. Pure: identity of the output is a function of the injected
 * timestamps alone, so replay reproduces it exactly.
 */
export function evaluateIdleTimer(input: IdleTimerInput): TimerTrigger | null {
  if (!idleTriggered(input)) return null
  return {
    kind: 'idle',
    sinceTs: input.lastActivityTs,
    asOfTs: input.asOfTs,
    elapsedMs: parseIso(input.asOfTs) - parseIso(input.lastActivityTs),
  }
}

/**
 * Evaluate the dwell timer for a specific zone, returning a deterministic
 * TimerTrigger when the dwell threshold is met or null otherwise. `zoneId` is
 * carried onto the trigger so the orchestration loop knows which zone dwelt.
 */
export function evaluateDwellTimer(
  input: DwellTimerInput & { zoneId: number },
): TimerTrigger | null {
  if (!dwellTriggered(input)) return null
  return {
    kind: 'dwell',
    zoneId: input.zoneId,
    sinceTs: input.zoneEnteredTs,
    asOfTs: input.asOfTs,
    elapsedMs: parseIso(input.asOfTs) - parseIso(input.zoneEnteredTs),
  }
}
