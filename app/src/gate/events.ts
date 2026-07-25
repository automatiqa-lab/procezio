// M2-10 - the app-boundary event builder for the Zone 7 (Risk gate) surface.
//
// The PURE, isomorphic half of the Risk-gate zone. Zone 7 runs five risk checks on
// each shortlisted opportunity; a business case (zone 8) is blocked while any of its
// checks is still open (spec v0.2 section 6: the gate "blocks the case"). Each check
// leaves the UI as one gate.checked event; C9 folds it into canvas.gates, upserting by
// the (opportunity, check) composite key (M2-AMD2), so re-checking a check replaces
// its status in place.
//
// Pure candidate builders like every zone's events.ts - see store/envelope.ts for the
// canonical purity/layering explanation. The human sets open/cleared - these helpers
// never decide whether a check passes.

import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
import type { GatePayload as Gate } from '@procezio/schema'

/** A gate.checked payload's check field, reused so the check list cannot drift. */
type GateCheck = Gate['check']
/** A gate.checked payload's status field. */
export type GateStatus = Gate['status']

/**
 * The five zone-7 risk checks, in the order the surface presents them (spec v0.2
 * section 6). Typed against the imported Gate['check'] union via satisfies, so this
 * display list cannot drift from the schema's own literals - ajv inside the C8 store
 * still gates truth.
 */
export const GATE_CHECKS = [
  'data-privacy',
  'regulatory-compliance',
  'failure-blast-radius',
  'accountability',
  'change-impact-on-people',
] as const satisfies readonly GateCheck[]

/** A plain-language title + question per check, so a no-code user reads meaning. */
export const CHECK_INFO = {
  'data-privacy': {
    title: 'Data privacy',
    question: 'Does automating this touch personal or sensitive data that needs safeguards?',
  },
  'regulatory-compliance': {
    title: 'Regulatory compliance',
    question: 'Is this step governed by a rule, audit, or law that a machine must still honour?',
  },
  'failure-blast-radius': {
    title: 'Failure blast radius',
    question: 'If it goes wrong unattended, how far and fast does the damage spread?',
  },
  accountability: {
    title: 'Accountability',
    question: 'When a machine does this, who is answerable for the outcome?',
  },
  'change-impact-on-people': {
    title: 'Impact on people',
    question: 'Whose role or workload changes, and are they part of the change?',
  },
} as const satisfies Record<GateCheck, { title: string; question: string }>

/**
 * Build a gate.checked DispatchCandidate. `sessionId` is the open session's id
 * (carried as both session_id and correlation_id). event_id/ts are absent - the store
 * resolves them from its injected providers, so this stays pure. The optional finding
 * is only included when non-empty (exactOptionalPropertyTypes: never finding:undefined).
 */
export function buildGateCheckedCandidate(
  sessionId: string,
  opportunityId: string,
  check: GateCheck,
  status: GateStatus,
  finding?: string,
): DispatchCandidate {
  const trimmed = finding?.trim() ?? ''
  const gate: Gate = {
    opportunity_id: opportunityId,
    check,
    status,
    ...(trimmed.length > 0 ? { finding: trimmed } : {}),
  }
  return humanInk(sessionId, 'gate.checked', gate)
}

/**
 * Is every one of the five checks cleared for this opportunity? Pure over the
 * projected gates. A check with no gate row yet counts as NOT cleared (the gate
 * starts closed), so a case is blocked until all five are explicitly cleared.
 */
export function allChecksCleared(gates: readonly Gate[], opportunityId: string): boolean {
  return GATE_CHECKS.every((check) =>
    gates.some(
      (g) => g.opportunity_id === opportunityId && g.check === check && g.status === 'cleared',
    ),
  )
}

/** The current status of one check for one opportunity, or 'open' if unrecorded. */
export function statusOf(
  gates: readonly Gate[],
  opportunityId: string,
  check: GateCheck,
): GateStatus {
  const row = gates.find((g) => g.opportunity_id === opportunityId && g.check === check)
  return row?.status ?? 'open'
}

/** The recorded finding note for one check, if any. */
export function findingOf(gates: readonly Gate[], opportunityId: string, check: GateCheck): string {
  const row = gates.find((g) => g.opportunity_id === opportunityId && g.check === check)
  return row?.finding ?? ''
}
