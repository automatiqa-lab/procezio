// M2-08 - the app-boundary event builder for the Zone 5 (Ideation) surface.
//
// Pure candidate builder like every zone's events.ts - see store/envelope.ts for the
// canonical purity/layering explanation. C9 project() upserts by id into
// canvas.opportunities.
//
// Divergent/convergent separation (spec v0.2 sections 6 & 9, the hard rule): zone 5
// GENERATES candidates without judgment. It carries NO score, NO rung, NO triage - a
// candidate born here is only { id, title }. Judging (triage, scoring, rung) happens
// only in zone 6, on its own events. The builder enforces this by construction: it
// accepts a title and emits an Opportunity with nothing but id + title, so a zone-5
// surface has no way to attach a judgment even if it tried.

import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
import type { Opportunity } from '@procezio/schema'

/**
 * Shape a titled, judgment-free Opportunity for zone 5. Only id + title are set -
 * this is the structural guarantee that ideation carries no score/rung/triage. `id`
 * is minted by the caller at the app edge (crypto.randomUUID, a valid schema Id);
 * `title` is the user's idea, trimmed by the caller.
 */
export function newIdeaOpportunity(id: string, title: string): Opportunity {
  return { id, title }
}

/**
 * Wrap a schema Opportunity in an `opportunity.created` DispatchCandidate. `sessionId`
 * is the open session's id (carried by every candidate as both session_id and
 * correlation_id, exactly as data/events.ts does). event_id and ts are deliberately
 * absent - the store resolves them from its injected providers, so this stays a pure
 * function of its inputs. C9's upsert-by-id then places it in canvas.opportunities.
 */
export function buildOpportunityCreatedCandidate(
  sessionId: string,
  opportunity: Opportunity,
): DispatchCandidate {
  return humanInk(sessionId, 'opportunity.created', { opportunity })
}
