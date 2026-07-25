// C-TASK #3 - the "ask the agent" chat panel (right-panel section).
//
// The agent's conversational surface (the ratified prototype's agent panel). Shown only
// when a model is connected. The user asks a question; the agent answers grounded in the
// canvas and its reply is logged as an agent.message event. Turns render as a small
// conversation; the deterministic canvas never depends on this.

import { useRef, useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { LlmClient } from '@procezio/core'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import { askAgent, chatCandidate } from './chat.js'

export interface ChatPanelProps {
  store: StoreApi<CanvasStoreState>
  client: LlmClient | null
}

interface Turn {
  who: 'you' | 'agent'
  text: string
}

export function ChatPanel({ store, client }: ChatPanelProps): JSX.Element | null {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const dispatch = useCanvasStore(store, (s) => s.dispatch)
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // The in-flight ask's cancel handle - the Cancel button aborts the underlying fetch.
  const abortRef = useRef<AbortController | null>(null)

  // Hidden entirely with no model - the agent is an accelerant, never required.
  if (client === null) return null

  const send = async (): Promise<void> => {
    const question = draft.trim()
    if (question.length === 0 || busy) return
    setDraft('')
    setTurns((t) => [...t, { who: 'you', text: question }])
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    const reply = await askAgent(client, question, canvas, { signal: controller.signal })
    abortRef.current = null
    setBusy(false)
    if (reply === null) {
      setTurns((t) => [
        ...t,
        {
          who: 'agent',
          text: controller.signal.aborted ? 'Cancelled.' : 'I could not reach the model just now.',
        },
      ])
      return
    }
    setTurns((t) => [...t, { who: 'agent', text: reply }])
    if (sessionId !== null) dispatch(chatCandidate(sessionId, reply))
  }

  const cancel = (): void => abortRef.current?.abort()

  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.border}`,
        background: theme.surface2,
        flex: '0 0 auto',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.accent,
        }}
      >
        <span>◆ Ask the agent</span>
        <span aria-hidden="true" style={{ color: theme.textMuted }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div style={{ padding: '0 14px 14px' }}>
          {turns.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 10,
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {turns.map((t, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: t.who === 'you' ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                    padding: '8px 11px',
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: theme.text,
                    background: t.who === 'you' ? theme.accentSoft : '#ffffff',
                    border: `1px solid ${t.who === 'you' ? theme.accent : theme.pencil}`,
                  }}
                >
                  {t.who === 'agent' ? (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: theme.pencil,
                        marginBottom: 2,
                      }}
                    >
                      agent · pencil
                    </span>
                  ) : null}
                  {t.text}
                </div>
              ))}
            </div>
          ) : (
            <p
              style={{ fontSize: 12, color: theme.textMuted, margin: '0 0 10px', lineHeight: 1.5 }}
            >
              Ask about your process - the agent answers from your canvas, never inventing.
            </p>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              aria-label="Ask the agent"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={busy ? 'Thinking…' : 'Reply, or ask about a zone'}
              disabled={busy}
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 13,
                color: theme.text,
                background: '#ffffff',
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                boxSizing: 'border-box',
              }}
            />
            {busy ? (
              <button
                type="button"
                onClick={cancel}
                style={{
                  cursor: 'pointer',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: theme.textMuted,
                  background: '#ffffff',
                }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send()}
                disabled={draft.trim().length === 0}
                style={{
                  cursor: draft.trim().length === 0 ? 'default' : 'pointer',
                  border: `1px solid ${theme.accent}`,
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: theme.onAccent,
                  background: theme.accent,
                }}
              >
                Ask
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
