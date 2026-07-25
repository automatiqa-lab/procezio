// v0.4 Facilitator panel (spec 01b section 6, prototype #timebox + #park). The Facilitator
// paces and routes: a gentle timebox prompt and a parking lot for "later" items so a tangent
// never derails the pass. Presentation only - the parking lot is session-local UI state and the
// elapsed clock is wall time for display (never the methodology's deterministic time).

import { useEffect, useState } from 'react'
import { theme } from '../theme.js'

interface FacilitatorPanelProps {
  /** Session start (ms epoch). Owned by App: the clock must survive this panel's unmount. */
  startedAt: number
  /** Parked tangents. Owned by App: 'Hide agent' or Express mode must never destroy them. */
  parked: readonly string[]
  onPark: (text: string) => void
  onRemove: (index: number) => void
}

export function FacilitatorPanel({ startedAt, parked, onPark, onRemove }: FacilitatorPanelProps) {
  const [now, setNow] = useState(() => Date.now())
  const [note, setNote] = useState('')

  // A quiet clock, ticking once a minute (display only; never feeds the event log).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000))

  const park = (): void => {
    const text = note.trim()
    if (text === '') return
    onPark(text)
    setNote('')
  }

  return (
    <div style={{ padding: '0 12px 10px' }}>
      <div
        style={{
          border: `1px solid ${theme.border}`,
          borderLeft: `4px solid ${theme.text}`,
          borderRadius: 10,
          padding: '9px 11px',
          fontSize: 12.5,
          background: theme.bg,
          marginBottom: 10,
        }}
      >
        <strong>⏱ {minutes} min this session.</strong> Good stopping point - or one more pass? Your
        call.
      </div>

      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.9,
          textTransform: 'uppercase',
          color: theme.textMuted,
          margin: '0 0 6px',
        }}
      >
        Parking lot
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') park()
          }}
          placeholder="Park a tangent for later…"
          aria-label="Parking lot note"
          style={{
            flex: '1 1 auto',
            padding: '5px 8px',
            fontSize: 12.5,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
          }}
        />
        <button
          type="button"
          onClick={park}
          aria-label="Park this note"
          style={{
            border: `1px solid ${theme.border}`,
            background: '#fff',
            borderRadius: 6,
            padding: '0 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Park
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {parked.map((p, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '3px 8px',
              background: '#fff',
            }}
          >
            {p}
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Remove ${p}`}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: theme.textMuted,
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
