// M2-08 - the Zone 5 (Ideation) surface.
//
// A PURE VIEW over the M2-01 store, like FrictionZone/DataZone. The store is never
// the source of truth in the component: the candidate list reads canvas.opportunities
// (a C9 projection of the event log), and every idea leaves the UI as one
// `opportunity.created` event.
//
//   read : store canvas (C9 projection) -> canvas.opportunities -> view
//   write: type an idea, Add -> buildOpportunityCreatedCandidate -> store.dispatch
//
// Divergent/convergent separation (spec v0.2 section 6, the hard rule): this zone
// GENERATES without judging. There are, by deliberate design, NO scoring affordances
// here - no sliders, no 1-5, no rung, no triage, no ordering by "value". Those live
// in zone 6 and are structurally unreachable from this surface. The count nudges
// toward the "at least five candidates" bar (spec section 14) without ranking any of
// them.
//
// Ids are minted HERE, at the app edge (crypto.randomUUID), the store staying pure.
//
// Layering (constitution / AGENTS.md): adding an idea makes no judgement about
// whether it is good. It only shapes the candidate; the precompiled ajv validator in
// the C8 event store decides acceptance and C9 upserts it into canvas.opportunities.

import { useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { LlmClient } from '@procezio/core'
import type { Opportunity } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import { nodeLabel } from '../nodeLabel.js'
import { ideationCandidates, suggestCandidates } from '../tasks/ideation.js'
import { buildOpportunityCreatedCandidate, newIdeaOpportunity } from './events.js'

export interface IdeationZoneProps {
  store: StoreApi<CanvasStoreState>
  /** The connected model (or null). When present the agent can suggest pencil candidates. */
  client?: LlmClient | null
}

/** The suggested-candidate bar from the spec's pass criteria (>= 5 candidates). */
const CANDIDATE_TARGET = 5

export function IdeationZone({ store, client }: IdeationZoneProps): JSX.Element {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const dispatch = useCanvasStore(store, (s) => s.dispatch)
  const provenance = useCanvasStore(store, (s) => s.provenance)
  const [draft, setDraft] = useState('')
  const [suggesting, setSuggesting] = useState(false)

  // canvas.opportunities is optional in the schema but always [] in the empty
  // projection; ?? [] keeps this total without assuming the key is present.
  const ideas = canvas.opportunities ?? []
  const canMutate = sessionId !== null

  // --- Write: adding an idea produces one opportunity.created event. ------------
  const addIdea = (): void => {
    const title = draft.trim()
    if (sessionId === null || title.length === 0) return
    const opportunity: Opportunity = newIdeaOpportunity(crypto.randomUUID(), title)
    dispatch(buildOpportunityCreatedCandidate(sessionId, opportunity))
    setDraft('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addIdea()
    }
  }

  // --- Agent (pencil) suggestions: contribute, never judge (spec zone 5). --------
  const suggest = async (): Promise<void> => {
    if (client === null || client === undefined || sessionId === null) return
    setSuggesting(true)
    const ctx = {
      steps: canvas.nodes.map(nodeLabel).join('; ') || '(none mapped)',
      friction:
        (canvas.friction ?? [])
          .map((f) => `${f.waste}${f.note ? ` (${f.note})` : ''}`)
          .join('; ') || '(none pinned)',
      existing: ideas.map((o) => o.title).join('; ') || '(none yet)',
    }
    const titles = await suggestCandidates(client, ctx)
    setSuggesting(false)
    if (titles === null) return
    const ids = titles.map(() => crypto.randomUUID())
    for (const c of ideationCandidates(sessionId, titles, ids)) dispatch(c)
  }

  const remaining = Math.max(0, CANDIDATE_TARGET - ideas.length)

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '16px 18px',
      }}
    >
      <div style={{ maxWidth: 760 }}>
        {/* Compact intro (the frame header names the zone). */}
        <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 6px', color: theme.textMuted }}>
          Generate improvement ideas freely - one line each. Automation is only one answer: removing
          a step, simplifying it, or re-connecting a handoff often beats automating it. Quantity
          first: a wide net now beats a clever few. This is the diverge phase.
        </p>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            margin: '0 0 24px',
            color: theme.textMuted,
            fontStyle: 'italic',
          }}
        >
          No scoring here on purpose. Judging while generating kills ideas - you rank and triage
          them next, in Prioritize (Zone 6).
        </p>

        {/* Add an idea */}
        <label
          htmlFor="ideation-input"
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 700,
            color: theme.text,
            marginBottom: 6,
          }}
        >
          Add an idea
        </label>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <input
            id="ideation-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Add an improvement idea"
            placeholder="e.g. drop the second approval, or auto-match invoices to purchase orders"
            disabled={!canMutate}
            style={{
              flex: '1 1 auto',
              padding: '11px 13px',
              fontSize: 15,
              color: theme.text,
              background: '#ffffff',
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={addIdea}
            disabled={!canMutate || draft.trim().length === 0}
            style={{
              flex: '0 0 auto',
              cursor: draft.trim().length === 0 ? 'default' : 'pointer',
              border: `1px solid ${draft.trim().length === 0 ? theme.border : theme.accent}`,
              borderRadius: 8,
              padding: '11px 20px',
              fontSize: 14,
              fontWeight: 700,
              color: draft.trim().length === 0 ? theme.textMuted : theme.onAccent,
              background: draft.trim().length === 0 ? theme.surface2 : theme.accent,
            }}
          >
            Add
          </button>
        </div>

        {/* Agent (pencil) suggestions - offered only when a model is connected. The
            agent contributes candidates; it never scores them. Each lands in pencil for
            review. */}
        {client !== null && client !== undefined ? (
          <button
            type="button"
            onClick={() => void suggest()}
            disabled={!canMutate || suggesting}
            style={{
              marginBottom: 18,
              cursor: suggesting ? 'default' : 'pointer',
              border: `1px dashed ${theme.accent}`,
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              color: theme.accent,
              background: 'transparent',
            }}
          >
            {suggesting ? 'Thinking…' : '◆ Suggest ideas with the agent'}
          </button>
        ) : null}

        {/* Count / candidate-bar nudge (no ranking, just a target). */}
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 26 }}>
          {ideas.length === 0 ? (
            <>No ideas yet. Aim for at least {CANDIDATE_TARGET} before you move on.</>
          ) : remaining > 0 ? (
            <>
              <strong style={{ color: theme.text }}>{ideas.length}</strong> idea
              {ideas.length === 1 ? '' : 's'} - {remaining} more to reach a healthy{' '}
              {CANDIDATE_TARGET}.
            </>
          ) : (
            <span style={{ color: theme.pass, fontWeight: 600 }}>
              {ideas.length} ideas - a healthy divergence. Move to Prioritize when ready.
            </span>
          )}
        </div>

        {/* The candidate list. Insertion order (event order), never ranked. */}
        {ideas.length > 0 ? (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {ideas.map((idea, i) => {
              const pencil = provenance.get(`opportunity:${idea.id}`)?.state === 'pencil'
              return (
                <li
                  key={idea.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12,
                    padding: '12px 14px',
                    border: `1px ${pencil ? 'dashed' : 'solid'} ${pencil ? theme.pencil : theme.border}`,
                    borderRadius: 8,
                    background: pencil ? theme.pencilSoft : theme.surface,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flex: '0 0 auto',
                      fontFamily: theme.mono,
                      fontSize: 12,
                      color: theme.textFaint,
                      minWidth: 22,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontSize: 15, color: theme.text, lineHeight: 1.4 }}>
                    {idea.title}
                  </span>
                  {pencil ? (
                    <span
                      style={{
                        flex: '0 0 auto',
                        marginLeft: 'auto',
                        fontSize: 11,
                        fontWeight: 700,
                        color: theme.pencil,
                      }}
                    >
                      ✎ agent
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
