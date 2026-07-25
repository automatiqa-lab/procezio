// v0.4 session-replay scrubber (spec 01b Wave 3 F4): drag through the session's history.
//
// A read-only time-travel slider over the event log. At each position it shows the canvas as it
// stood then - what just happened and the running counts - so you can watch the session accrue.
// It never mutates the store (the past is the past); closing returns you to the live canvas.

import { useMemo, useState } from 'react'
import type { EventEnvelope } from '@procezio/core'
import { theme } from '../theme.js'
import { replayAt } from './replay.js'
import { ModalOverlay } from '../canvas/ModalOverlay.js'

interface ReplayScrubberProps {
  events: readonly EventEnvelope[]
  onClose: () => void
}

export function ReplayScrubber({ events, onClose }: ReplayScrubberProps) {
  const total = events.length
  const [k, setK] = useState(total)
  const frame = useMemo(() => replayAt(events, k), [events, k])

  const stat = (label: string, value: number) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{value}</div>
      <div style={{ fontSize: 10.5, color: theme.textMuted }}>{label}</div>
    </div>
  )

  return (
    <ModalOverlay
      label="Session replay"
      onClose={onClose}
      zIndex={60}
      width="min(560px, 94vw)"
      padding="20px 22px"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <strong style={{ fontSize: 14 }}>Session replay</strong>
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          time-travel over your event log - read-only
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close replay"
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: theme.textMuted,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>

      {total === 0 ? (
        <p style={{ fontSize: 13, color: theme.textMuted }}>No events yet - do some work first.</p>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              gap: 8,
              padding: '12px 0',
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            {stat('steps', frame.nodes)}
            {stat('friction', frame.friction)}
            {stat('ideas', frame.opportunities)}
            {stat('committed', frame.committed)}
            {stat('cases', frame.cases)}
          </div>

          <div style={{ margin: '14px 0 6px', fontSize: 13, color: theme.text }}>
            <span style={{ color: theme.accent, fontWeight: 700 }}>
              {frame.step}/{frame.total}
            </span>{' '}
            - {frame.lastEvent}
          </div>
          <input
            type="range"
            min={1}
            max={total}
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            aria-label="Replay position"
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <button type="button" onClick={() => setK(1)} style={pill}>
              ⏮ start
            </button>
            <button type="button" onClick={() => setK(total)} style={pill}>
              now ⏭
            </button>
          </div>
        </>
      )}
    </ModalOverlay>
  )
}

const pill: React.CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: '#fff',
  borderRadius: 999,
  padding: '3px 11px',
  fontSize: 11.5,
  cursor: 'pointer',
  color: theme.text,
}
