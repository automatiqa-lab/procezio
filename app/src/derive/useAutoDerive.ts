// The autopopulation dispatcher: watches the live canvas and, after a HUMAN map
// edit, raises the deterministic derive.ts suggestions as agent PENCIL events
// (friction.pinned / opportunity.created). The human reviews each one in the
// pencil panel - the agent proposes, the human vetoes (constitution p5).
//
// Three guards make this safe in an event-sourced app:
//  1. BASELINE - on mount / store swap the current log length is adopted without
//     acting, so a loaded .pnav or a swapped-in session never triggers a burst of
//     suggestions for history it merely replayed.
//  2. HUMAN-EDIT GATE - suggestions fire only when the newly-appended events since
//     the last look contain a human-authored map edit (node/edge created, or a
//     pencil accept). Demo playback and agent drafts never trigger derivation; the
//     `paused` flag additionally hard-stops it while the scripted demo is driving.
//  3. LOG-WIDE DEDUPE - a suggestion id (or an equivalent element the user already
//     created by hand) that EVER appeared in the log is never raised again, so a
//     rejected suggestion stays rejected - changing your mind is respected, not
//     nagged.

import { useEffect, useRef } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { EventEnvelope } from '@procezio/core'
import type { FlagPayload, FrictionPayload, OpportunityPayload } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { agentPencil } from '../store/envelope.js'
import { deriveFrictionSuggestions, deriveOpportunitySuggestions } from './derive.js'

/** The creating families that ARE the map. Compensations reuse their target's type,
 * so the gate below additionally requires `compensates == null` - an undo/redo/delete
 * is bookkeeping over past edits, not the user drawing the process. */
const MAP_EDIT_TYPES: ReadonlySet<string> = new Set(['node.created', 'edge.created'])

/**
 * True when this fresh event is the human touching the MAP: drawing a node/edge, or
 * accepting a pencil map draft (a flag.accepted whose target created a map element -
 * rejections and decisions on non-map pencils are not map work).
 */
function isHumanMapEdit(event: EventEnvelope, typeById: ReadonlyMap<string, string>): boolean {
  if (event.author.kind !== 'human' || event.compensates != null) return false
  if (MAP_EDIT_TYPES.has(event.type)) return true
  if (event.type !== 'flag.accepted') return false
  const flag = event.payload as FlagPayload
  if (flag.decision !== 'accepted') return false
  return MAP_EDIT_TYPES.has(typeById.get(flag.target_event_id) ?? '')
}

/** The persona byline suggestions carry in provenance and the pencil review. */
const DERIVER_ID = 'auditor'

export function useAutoDerive(store: StoreApi<CanvasStoreState>, paused: boolean): void {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  // How much of the log has been looked at. Advances even while paused/gated, so
  // re-enabling never acts on stale history.
  const lastSeen = useRef(0)

  // A swapped-in store (load, demo, new session) starts from its own baseline.
  useEffect(() => {
    lastSeen.current = store.getState().exportLog().length
  }, [store])

  useEffect(() => {
    const log = store.getState().exportLog()
    const fresh = log.slice(lastSeen.current)
    lastSeen.current = log.length
    if (paused || sessionId === null || fresh.length === 0) return
    // Resolve flag targets by id so a pencil accept only counts when it accepted a
    // MAP element (the log is small; one pass builds the lookup).
    const typeById = new Map(log.map((e) => [e.event_id, e.type]))
    if (!fresh.some((e) => isHumanMapEdit(e, typeById))) return

    // Everything ever raised or created, by element id - the never-nag memory.
    const seenFriction = new Set<string>()
    const seenOpportunity = new Set<string>()
    const coveredEdges = new Set<string>() // edges an existing idea already targets
    for (const e of log) {
      if (e.type === 'friction.pinned') {
        seenFriction.add((e.payload as FrictionPayload).friction.id)
      } else if (e.type === 'opportunity.created') {
        const opp = (e.payload as OpportunityPayload).opportunity
        seenOpportunity.add(opp.id)
        for (const ref of opp.target_refs ?? []) coveredEdges.add(ref)
      }
    }
    // Semantic dedupe for friction: the user may have pinned the same waste on the
    // same step by hand - suggesting a duplicate would be noise.
    const pinnedWaste = new Set((canvas.friction ?? []).map((f) => `${f.node_id}:${f.waste}`))

    for (const friction of deriveFrictionSuggestions(canvas)) {
      if (seenFriction.has(friction.id)) continue
      if (pinnedWaste.has(`${friction.node_id}:${friction.waste}`)) continue
      store.getState().dispatch(agentPencil(sessionId, 'friction.pinned', { friction }, DERIVER_ID))
    }
    for (const opportunity of deriveOpportunitySuggestions(canvas)) {
      if (seenOpportunity.has(opportunity.id)) continue
      if ((opportunity.target_refs ?? []).some((ref) => coveredEdges.has(ref))) continue
      store
        .getState()
        .dispatch(agentPencil(sessionId, 'opportunity.created', { opportunity }, DERIVER_ID))
    }
  }, [canvas, paused, sessionId, store])
}
