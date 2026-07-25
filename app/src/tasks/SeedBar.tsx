// C-TASK #1a - the seed bar: describe the process, let the agent draft a pencil map.
//
// The cold-start affordance (spec zone 2). Shown only when a model is connected; the
// agent's draft lands as pencil nodes the user then reviews (accept/reject) in the
// Pencil panel. With no model, this is hidden and the user draws the map by hand - the
// methodology never depends on the agent.

import { useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { LlmClient } from '@procezio/core'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import { seedCandidates, seedSkeleton } from './seed.js'

export interface SeedBarProps {
  store: StoreApi<CanvasStoreState>
  client: LlmClient | null
}

export function SeedBar({ store, client }: SeedBarProps): JSX.Element | null {
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  // Only offered when the agent is available - otherwise the user maps by hand.
  if (client === null) return null

  const draft = async (): Promise<void> => {
    if (sessionId === null || desc.trim().length === 0) return
    setBusy(true)
    setStatus(null)
    const seed = await seedSkeleton(client, desc.trim())
    setBusy(false)
    if (seed === null) {
      setStatus(
        'The agent could not draft a map from that. Try a fuller description, or draw it yourself.',
      )
      return
    }
    const cands = seedCandidates(sessionId, seed)
    for (const c of cands) store.getState().dispatch(c)
    setStatus(`Drafted ${seed.nodes.length} steps in pencil - review each in the Pencil panel.`)
    setDesc('')
  }

  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.border}`,
        background: theme.surface2,
        flex: '0 0 auto',
        padding: '12px 16px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.accent,
          marginBottom: 6,
        }}
      >
        ◆ Draft a map
      </div>
      <textarea
        aria-label="Describe the process"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Describe the process in a sentence or two - who does what, in order."
        disabled={busy}
        rows={3}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 13,
          color: theme.text,
          background: '#ffffff',
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          boxSizing: 'border-box',
          resize: 'vertical',
          fontFamily: theme.sans,
        }}
      />
      <button
        type="button"
        onClick={() => void draft()}
        disabled={busy || desc.trim().length === 0}
        style={{
          marginTop: 8,
          width: '100%',
          cursor: busy || desc.trim().length === 0 ? 'default' : 'pointer',
          border: `1px solid ${theme.accent}`,
          borderRadius: 7,
          padding: '8px',
          fontSize: 13,
          fontWeight: 700,
          color: busy || desc.trim().length === 0 ? theme.textMuted : theme.onAccent,
          background: busy || desc.trim().length === 0 ? theme.surface3 : theme.accent,
        }}
      >
        {busy ? 'Drafting…' : 'Draft with agent'}
      </button>
      {status !== null ? (
        <div
          role="status"
          style={{ marginTop: 6, fontSize: 11, lineHeight: 1.4, color: theme.textMuted }}
        >
          {status}
        </div>
      ) : null}
    </div>
  )
}
