// M2-06 - the app-boundary event builder for the Zone 3 (Friction) surface.
//
// Pure candidate builder like every zone's events.ts - see store/envelope.ts for the
// canonical purity/layering explanation. C9 project() upserts by id into canvas.friction.

import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
// Friction/Downtime are imported from the ratified schema, never redefined here
// (CardContract: "Friction types (Friction, Downtime, Node) are imported from
// @procezio/schema and not redefined"). The caller builds the Friction from these
// contracts and hands it in; this helper only wraps it in the event envelope shape
// the store expects.
import type { Downtime, Friction } from '@procezio/schema'

/**
 * The 8 DOWNTIME wastes in the order the chips present them (spec v0.2 section 6,
 * zone 3). This is a DISPLAY/ITERATION array, typed against the imported `Downtime`
 * union so it cannot drift from the schema's own literal values - it is never a
 * second source of truth for validity (ajv inside the C8 store still gates truth).
 * The `satisfies` clause makes the compiler reject any label that is not a member
 * of the schema union, and the explicit annotation keeps every member covered.
 */
export const DOWNTIME_WASTES = [
  'Defects',
  'Overproduction',
  'Waiting',
  'Non-utilized-talent',
  'Transportation',
  'Inventory',
  'Motion',
  'Extra-processing',
] as const satisfies readonly Downtime[]

// Humanized DISPLAY labels (spec C8): plain-language names a non-coder recognises, shown in the
// UI. The formal DOWNTIME taxonomy is what gets STORED (Friction.waste); this only labels it.
export const DOWNTIME_LABELS: Readonly<Record<Downtime, string>> = {
  Defects: 'Rework & errors',
  Overproduction: 'Doing more than needed',
  Waiting: 'Waiting',
  'Non-utilized-talent': 'Skills going to waste',
  Transportation: 'Moving work around',
  Inventory: 'Backlog & pile-ups',
  Motion: 'Chasing & switching',
  'Extra-processing': 'Double work',
}

/** The plain-language label for a waste; falls back to the raw value if unmapped. */
export function wasteLabel(waste: Downtime): string {
  return DOWNTIME_LABELS[waste] ?? waste
}

/**
 * Wrap a schema Friction in a `friction.pinned` DispatchCandidate. `sessionId` is
 * the open session's id (minted at the app boundary and carried by every candidate
 * as both session_id and correlation_id, exactly as session.ts / map/events.ts do).
 * event_id and ts are deliberately absent - the store resolves them from its
 * injected providers, so this stays a pure function of its inputs. The Friction's
 * own id is minted by the caller at the app edge (crypto.randomUUID); C9's
 * upsertBy-id then places it in canvas.friction.
 */
export function buildFrictionPinnedCandidate(
  sessionId: string,
  friction: Friction,
): DispatchCandidate {
  return humanInk(sessionId, 'friction.pinned', { friction })
}
