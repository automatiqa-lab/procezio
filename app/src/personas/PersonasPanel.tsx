// v0.4 stakeholder personas panel (spec v0.4 section 6, Wave 2 B4): the zone-1 "summon as
// persona" affordance. The user names up to three stakeholders (name, role, one-line perspective);
// summoning one asks the model to voice a single SIMULATED annotation from that viewpoint. Every
// contribution is tagged "simulated perspective" - rehearsal, never verification - and the export
// gate blocks until each is confirmed with the real stakeholder. Hard constraints (annotation-only,
// max 3) are enforced here; the model never approves or vetoes.

import { useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { LlmClient } from '@procezio/core'
import type { SimulatedPerspective, StakeholderPersona } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import { toast } from '../canvas/toast.js'
import { runPersonaAnnotation } from './annotate.js'
import {
  buildPersonaDefinedCandidate,
  buildPersonaAnnotatedCandidate,
  buildPersonaConfirmedCandidate,
} from './events.js'

const MAX_PERSONAS = 3

// Stable empty arrays so the selectors never return a fresh reference (React #185).
const NO_PERSONAS: readonly StakeholderPersona[] = []
const NO_PERSPECTIVES: readonly SimulatedPerspective[] = []

interface PersonasPanelProps {
  store: StoreApi<CanvasStoreState>
  client?: LlmClient | null
}

export function PersonasPanel({ store, client }: PersonasPanelProps) {
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const personas = useCanvasStore(store, (s) => getCanvas(s).stakeholder_personas) ?? NO_PERSONAS
  const perspectives =
    useCanvasStore(store, (s) => getCanvas(s).simulated_perspectives) ?? NO_PERSPECTIVES
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [perspective, setPerspective] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const addPersona = (): void => {
    if (sessionId === null || personas.length >= MAX_PERSONAS) return
    if (name.trim() === '' || role.trim() === '' || perspective.trim() === '') return
    store.getState().dispatch(
      buildPersonaDefinedCandidate(sessionId, {
        id: crypto.randomUUID(),
        name: name.trim(),
        role: role.trim(),
        perspective: perspective.trim(),
      }),
    )
    setName('')
    setRole('')
    setPerspective('')
  }

  const summon = (persona: StakeholderPersona): void => {
    if (sessionId === null) return
    if (client === null || client === undefined) {
      toast('Connect a model to hear a simulated perspective. Personas are defined either way.')
      return
    }
    setBusy(persona.id)
    void runPersonaAnnotation(client, persona, getCanvas(store.getState()))
      .then((a) => {
        if (a === null) return
        store.getState().dispatch(
          buildPersonaAnnotatedCandidate(sessionId, {
            id: crypto.randomUUID(),
            persona_id: persona.id,
            text: a.text,
            ...(a.cited_refs.length > 0 ? { cited_refs: a.cited_refs } : {}),
          }),
        )
        toast(`${persona.name} (simulated) added a perspective - confirm it with the real person.`)
      })
      .finally(() => setBusy(null))
  }

  const confirm = (sp: SimulatedPerspective): void => {
    if (sessionId === null) return
    store.getState().dispatch(
      buildPersonaConfirmedCandidate(sessionId, {
        id: sp.id,
        persona_id: sp.persona_id,
        text: sp.text,
        ...(sp.anchor_ref !== undefined ? { anchor_ref: sp.anchor_ref } : {}),
        ...(sp.cited_refs !== undefined ? { cited_refs: sp.cited_refs } : {}),
      }),
    )
    toast('Confirmed with the real stakeholder - it no longer blocks export.')
  }

  const nameFor = (id: string): string => personas.find((p) => p.id === id)?.name ?? 'Stakeholder'

  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${theme.border}`, paddingTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Stakeholders</div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
        Name up to three stakeholders and summon a <em>simulated</em> perspective to rehearse their
        reaction. Rehearsal, never verification - confirm each with the real person before you rely
        on it.
      </p>

      <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'grid', gap: 8 }}>
        {personas.map((p) => (
          <li
            key={p.id}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '8px 10px',
              background: theme.surface,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>{p.name}</strong>
              <span style={{ fontSize: 11, color: theme.textMuted }}>{p.role}</span>
              <button
                type="button"
                onClick={() => summon(p)}
                disabled={busy === p.id}
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  color: theme.accent,
                  background: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  padding: '2px 8px',
                  cursor: busy === p.id ? 'default' : 'pointer',
                }}
              >
                {busy === p.id ? 'Summoning…' : 'Summon'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>
              {p.perspective}
            </div>
          </li>
        ))}
      </ul>

      {personas.length < MAX_PERSONAS ? (
        <div style={{ display: 'grid', gap: 6, marginBottom: 4 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Priya)"
            aria-label="Stakeholder name"
            style={inputStyle}
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role (e.g. Finance controller)"
            aria-label="Stakeholder role"
            style={inputStyle}
          />
          <input
            value={perspective}
            onChange={(e) => setPerspective(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addPersona()
            }}
            placeholder="Their perspective in one line"
            aria-label="Stakeholder perspective"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={addPersona}
            style={{
              justifySelf: 'start',
              border: `1px solid ${theme.accent}`,
              background: theme.accent,
              color: theme.onAccent,
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Add stakeholder
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 11, color: theme.textFaint }}>
          Three stakeholders is the limit - a rehearsal, not a committee.
        </p>
      )}

      {perspectives.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            Simulated perspectives
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {perspectives.map((sp) => (
              <li
                key={sp.id}
                style={{
                  border: `1.5px dashed ${theme.pencil}`,
                  background: theme.pencilSoft,
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 12.5,
                  color: '#7A560B',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                  {nameFor(sp.persona_id).toUpperCase()} · SIMULATED PERSPECTIVE
                </div>
                <div style={{ margin: '3px 0', color: theme.text }}>{sp.text}</div>
                {sp.confirmed === true ? (
                  <span style={{ fontSize: 11, color: theme.pass, fontWeight: 600 }}>
                    confirmed with the real stakeholder ✓
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => confirm(sp)}
                    style={{
                      fontSize: 11,
                      color: theme.accent,
                      background: 'transparent',
                      border: `1px solid ${theme.border}`,
                      borderRadius: 6,
                      padding: '2px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    Confirm with real stakeholder
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: `1px solid ${theme.border}`,
  borderRadius: 6,
  fontSize: 13,
  fontFamily: theme.sans,
}
