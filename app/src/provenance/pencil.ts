// M2-16 - the two-ink provenance helpers: find pending agent (pencil) contributions.
//
// The two-ink rule (constitution p5): everything the agent writes is born PENCIL and
// stays pencil until a human accepts it (-> ink) or rejects it (-> removed). The core
// already models this - provenanceOf() projects each element's live provenance, and a
// flag.accepted event flips or removes it. This module reads that projection and lists
// what is still pending, so the UI can offer a DELIBERATE, per-item accept/reject (v0.3
// A3: no bulk-accept; each pencil item needs an individual action).
//
// Pure + isomorphic (no node:*, clock, RNG): a function of the event log alone.

import { provenanceOf } from '@procezio/core'
import type { EventEnvelope } from '@procezio/core'
import type {
  AuditTagPayload,
  EdgePayload,
  FrictionPayload,
  NodePayload,
  OpportunityPayload,
  Provenance,
} from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
import { nodeLabel } from '../nodeLabel.js'

/** One pending pencil contribution the human can accept or reject. */
export interface PencilItem {
  /** The creating event's id - the flag targets THIS (target_event_id). */
  targetEventId: string
  /** The element key, e.g. "node:n-raise-req" (matches core elementKeyOf). */
  key: string
  /** Coarse kind for grouping/labels: node | edge | friction | audit_tag | opportunity. */
  kind: string
  /** A short human label for the review list. */
  label: string
}

/** The element key for an event, matching core's internal elementKeyOf format. */
function elementKey(event: EventEnvelope): string | null {
  switch (event.type) {
    case 'node.created':
      return `node:${(event.payload as NodePayload).node.id}`
    case 'edge.created':
      return `edge:${(event.payload as EdgePayload).edge.id}`
    case 'friction.pinned':
      return `friction:${(event.payload as FrictionPayload).friction.id}`
    case 'audit_tag.set':
      return `audit_tag:${(event.payload as AuditTagPayload).audit_tag.id}`
    case 'opportunity.created':
      return `opportunity:${(event.payload as OpportunityPayload).opportunity.id}`
    default:
      return null
  }
}

/** A short label + kind for a creating event, for the review list. */
function describe(event: EventEnvelope): { kind: string; label: string } | null {
  switch (event.type) {
    case 'node.created': {
      const n = (event.payload as NodePayload).node
      return { kind: 'node', label: `${n.type}: ${nodeLabel(n)}` }
    }
    case 'edge.created': {
      const e = (event.payload as EdgePayload).edge
      return { kind: 'edge', label: `${e.from} -> ${e.to}` }
    }
    case 'friction.pinned': {
      const f = (event.payload as FrictionPayload).friction
      return { kind: 'friction', label: `Friction: ${f.waste}` }
    }
    case 'audit_tag.set':
      return { kind: 'audit_tag', label: 'Data/rules profile' }
    case 'opportunity.created': {
      const o = (event.payload as OpportunityPayload).opportunity
      return { kind: 'opportunity', label: `Idea: ${o.title}` }
    }
    default:
      return null
  }
}

/**
 * List the pending pencil contributions in a log. An element is pending when its live
 * provenance is 'pencil' (agent-authored, not yet accepted). The flag must target the
 * element's CREATING event, so we map each pencil key to the latest creating event that
 * carries it. Order follows the creating events' log order (deterministic).
 */
export function pendingPencil(
  log: readonly EventEnvelope[],
  provenance?: ReadonlyMap<string, Provenance>,
): PencilItem[] {
  // The caller (the store) already folds provenanceOf per dispatch; accept it rather
  // than folding the same log twice. Absent = fold here (headless tests, other callers).
  const prov = provenance ?? provenanceOf(log)
  // Latest creating event per element key (a re-create would supersede).
  const creatorByKey = new Map<string, EventEnvelope>()
  for (const event of log) {
    const key = elementKey(event)
    if (key !== null) creatorByKey.set(key, event)
  }
  const out: PencilItem[] = []
  for (const event of log) {
    const key = elementKey(event)
    if (key === null) continue
    // Only the latest creator of a key represents it; skip superseded ones.
    if (creatorByKey.get(key) !== event) continue
    if (prov.get(key)?.state !== 'pencil') continue
    const d = describe(event)
    if (d === null) continue
    out.push({ targetEventId: event.event_id, key, kind: d.kind, label: d.label })
  }
  return out
}

/**
 * Build a human-authored flag.accepted event that ACCEPTS (-> ink) or REJECTS (-> removed)
 * the pencil element created by `targetEventId`. event_id/ts come from the store's
 * injected providers, so this stays a pure function of its inputs.
 */
export function buildFlagCandidate(
  sessionId: string,
  targetEventId: string,
  decision: 'accepted' | 'rejected',
): DispatchCandidate {
  return humanInk(
    sessionId,
    'flag.accepted',
    { target_event_id: targetEventId, decision },
    // The one builder that chains onto a prior event: the flag cites the pencil event it decides.
    { causationId: targetEventId },
  )
}
