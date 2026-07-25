// M2-12 - the app-boundary event builder for the session-wide assumption ledger.
//
// The PURE, isomorphic half of the assumption ledger (v0.3 A2). Unlike the eight
// zones, the ledger is a CROSS-CUTTING object that spans the whole session: it is
// populated whenever a quantity is flagged gut-feel, a node is marked varies, or a
// cost estimate is entered, and it prints as the business-case annex. Each entry
// leaves the UI as one assumption.added event; C9 APPENDS it to canvas.assumptions in
// log order (the ledger has no element id, so entries are ordered, not upserted).
//
// Pure candidate builder like every zone's events.ts - see store/envelope.ts for the
// canonical purity/layering explanation.
//
// Verification gate (v0.3 A2, the hard rule enforced here): a low-confidence
// assumption with no verify_by is UNACKNOWLEDGED. The pre-export gate blocks the
// business case while any such assumption exists - naming how you'll verify it (or
// raising its confidence) acknowledges it. needsVerification is the pure predicate.
//
import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
import type { Assumption } from '@procezio/schema'
import { ZONES } from '../zones.js'

/** Confidence levels for an assumption (matches the schema Assumption union). */
export const CONFIDENCE_LEVELS = ['low', 'med', 'high'] as const

/**
 * The v0.3 A2 gate predicate: a low-confidence assumption with no verify plan is
 * unacknowledged and blocks export. Naming a verify_by acknowledges it; a med/high
 * assumption never blocks. Pure over one entry.
 */
export function needsVerification(a: Assumption): boolean {
  return a.confidence === 'low' && (a.verify_by ?? '').trim().length === 0
}

/** How many ledger entries still block export (the count the gate shows). */
export function unverifiedCount(assumptions: readonly Assumption[]): number {
  return assumptions.filter(needsVerification).length
}

/**
 * Build an assumption.added DispatchCandidate. `sessionId` is the open session's id
 * (carried as both session_id and correlation_id). event_id/ts are absent - the store
 * resolves them from its injected providers, so this stays pure. Optional owner /
 * verify_by are included only when non-empty (exactOptionalPropertyTypes).
 */
export function buildAssumptionAddedCandidate(
  sessionId: string,
  assumption: Assumption,
): DispatchCandidate {
  return humanInk(sessionId, 'assumption.added', { assumption })
}

/**
 * Shape an Assumption from the ledger form, dropping empty optional keys so no key is
 * ever set to undefined (exactOptionalPropertyTypes). statement/source are trimmed by
 * the caller having validated them non-empty.
 */
export function newAssumption(
  statement: string,
  source: string,
  confidence: Assumption['confidence'],
  verifyBy: string,
  owner: string,
  admiralty?: Assumption['admiralty'],
  evidence?: string,
  id?: string,
): Assumption {
  const vb = verifyBy.trim()
  const ow = owner.trim()
  const ev = (evidence ?? '').trim()
  return {
    // v0.4 amendment: entries born with an id can be updated in place later (the
    // verify-plan acknowledge path); id-less entries stay append-only.
    ...(id !== undefined ? { id } : {}),
    statement: statement.trim(),
    source: source.trim(),
    confidence,
    ...(vb.length > 0 ? { verify_by: vb } : {}),
    ...(ow.length > 0 ? { owner: ow } : {}),
    ...(admiralty !== undefined ? { admiralty } : {}),
    ...(ev.length > 0 ? { evidence: ev } : {}),
  }
}

/** The fields the in-place review editor can change on an existing ledger entry. */
export interface AssumptionRevision {
  confidence?: Assumption['confidence']
  verifyBy?: string
  evidence?: string
}

/**
 * The in-place review path (v0.4 amendment): the SAME ledger entry, re-flagged with a
 * revised confidence / verify plan / evidence reference. Carries the entry's id when
 * it has one; a pre-amendment (id-less) entry is given `mintedId`, and C9's
 * statement+source adoption rule replaces it in place rather than duplicating it.
 * Absent revision fields keep the entry's current values; a field revised to empty is
 * dropped (exactOptionalPropertyTypes - a key is present or absent, never '').
 * Pure - the caller mints the id at the app edge.
 */
export function revisedAssumption(
  a: Assumption,
  r: AssumptionRevision,
  mintedId: string,
): Assumption {
  const vb = (r.verifyBy ?? a.verify_by ?? '').trim()
  const ev = (r.evidence ?? a.evidence ?? '').trim()
  const { verify_by: _vb, evidence: _ev, ...rest } = a
  return {
    ...rest,
    id: a.id ?? mintedId,
    confidence: r.confidence ?? a.confidence,
    ...(vb.length > 0 ? { verify_by: vb } : {}),
    ...(ev.length > 0 ? { evidence: ev } : {}),
  }
}

/**
 * Where an assumption's free-text `source` points on the canvas, if anywhere: "Zone 4",
 * "zone-4" or a zone's own name ("Data & Rules", "Map", ...) resolves to that zone, so
 * the ledger entry can offer a direct jump to the place needing clarification. Word-
 * boundary matching keeps "mapping" from reading as the Map zone. Pure; null when the
 * source names no zone (e.g. "gut feel from the collections desk").
 */
export function zoneFromSource(source: string): { id: number; name: string } | null {
  const byNumber = /\bzone[\s-]*([1-8])\b/i.exec(source)
  if (byNumber !== null) {
    const zone = ZONES.find((z) => z.id === Number(byNumber[1]))
    return zone === undefined ? null : { id: zone.id, name: zone.name }
  }
  for (const zone of ZONES) {
    const escaped = zone.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(source)) return { id: zone.id, name: zone.name }
  }
  return null
}
