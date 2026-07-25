// v0.4 session replay (spec 01b Wave 2/3 F4): time-travel over the event log.
//
// The event-sourced core makes this almost free - the canvas at any point in history is just the
// projection of the log up to that point. replayAt folds the first k events (via core project) and
// returns a compact summary of the canvas as it stood then. Pure and read-only: it never mutates
// the store; the scrubber shows the past, it does not change it.

import { project } from '@procezio/core'
import type { EventEnvelope } from '@procezio/core'

/** A short human label for an event type, for the scrubber's "what happened" line. */
const EVENT_LABELS: Record<string, string> = {
  'session.started': 'session started',
  'frame.set': 'framed the process',
  'node.created': 'added a step',
  'edge.created': 'connected a handoff',
  'friction.pinned': 'pinned friction',
  'audit_tag.set': 'tagged data & rules',
  'opportunity.created': 'raised an idea',
  'score.committed': 'committed a score',
  commitment: 'signed the commitment',
  'challenge.issued': 'the Challenger spoke',
  'challenge.answered': 'answered the Challenger',
  'gate.checked': 'ran a risk check',
  'case.drafted': 'drafted the case',
  'tobe.snapshot.accepted': 'accepted a to-be snapshot',
  'shoebox.item.added': 'added a Shoebox item',
  'persona.defined': 'defined a stakeholder',
  'persona.annotated': 'a simulated perspective',
  'assumption.added': 'flagged an assumption',
  'checkpoint.exported': 'exported a checkpoint',
}

export interface ReplayFrame {
  /** 1-based position in the log (k events applied). */
  step: number
  total: number
  /** Human label of the k-th event (the one that just happened). */
  lastEvent: string
  nodes: number
  friction: number
  opportunities: number
  committed: number
  cases: number
}

/**
 * Summarize the canvas after the first `k` events (1..total). Clamps k into range. Projects a
 * fresh canvas from the sliced log - read-only, no mutation of anything the caller holds.
 */
export function replayAt(events: readonly EventEnvelope[], k: number): ReplayFrame {
  const total = events.length
  const step = Math.max(1, Math.min(k, total))
  const slice = events.slice(0, step)
  const canvas = project(slice)
  const last = slice[step - 1]
  const opps = canvas.opportunities ?? []
  return {
    step,
    total,
    lastEvent: last ? (EVENT_LABELS[last.type] ?? last.type) : '(nothing yet)',
    nodes: canvas.nodes.length,
    friction: (canvas.friction ?? []).length,
    opportunities: opps.length,
    committed: opps.filter((o) => o.committed === true).length,
    cases: (canvas.cases ?? []).length,
  }
}
