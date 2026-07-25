// v0.4 stakeholder-persona event builders (spec v0.4 section 6, Wave 2 B4).
//
// A stakeholder persona is a constrained, annotation-only viewpoint the user summons to rehearse
// how a real stakeholder might react. Defining one is human ink; a persona's annotation is
// agent-authored, born pencil, and ALWAYS a simulated perspective - rehearsal, never verification.
// Confirming an annotation with the real stakeholder is a human act (re-emit with confirmed=true).

import type { StakeholderPersona } from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { agentPencil, humanInk } from '../store/envelope.js'

/** Define or edit a stakeholder persona (upsert by id). Human ink - the user owns their personas. */
export function buildPersonaDefinedCandidate(
  sessionId: string,
  persona: StakeholderPersona,
): DispatchCandidate {
  return humanInk(sessionId, 'persona.defined', { persona }, { schemaVersion: '1.2' })
}

/** A persona's simulated-perspective annotation (agent-authored, born pencil). */
export function buildPersonaAnnotatedCandidate(
  sessionId: string,
  annotation: {
    id: string
    persona_id: string
    text: string
    anchor_ref?: string
    cited_refs?: string[]
  },
): DispatchCandidate {
  return agentPencil(
    sessionId,
    'persona.annotated',
    {
      id: annotation.id,
      persona_id: annotation.persona_id,
      text: annotation.text,
      ...(annotation.anchor_ref !== undefined ? { anchor_ref: annotation.anchor_ref } : {}),
      ...(annotation.cited_refs !== undefined ? { cited_refs: annotation.cited_refs } : {}),
    },
    'stakeholder',
  )
}

/**
 * Confirm a simulated perspective with the real stakeholder (human ink): re-emit the annotation
 * by the same id with confirmed=true, so it stops blocking export. The text is carried through so
 * the upsert keeps the same annotation.
 */
export function buildPersonaConfirmedCandidate(
  sessionId: string,
  annotation: {
    id: string
    persona_id: string
    text: string
    anchor_ref?: string
    cited_refs?: string[]
  },
): DispatchCandidate {
  return humanInk(
    sessionId,
    'persona.annotated',
    {
      id: annotation.id,
      persona_id: annotation.persona_id,
      text: annotation.text,
      // Carry the evidence anchor/refs through the confirm, so the upsert does not drop them.
      ...(annotation.anchor_ref !== undefined ? { anchor_ref: annotation.anchor_ref } : {}),
      ...(annotation.cited_refs !== undefined ? { cited_refs: annotation.cited_refs } : {}),
      confirmed: true,
    },
    { schemaVersion: '1.2' },
  )
}
