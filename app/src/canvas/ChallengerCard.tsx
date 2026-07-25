// v0.4 Challenger card (spec 01b section 5): the live interjection, shown where you can read it.
//
// When a commitment wakes the Challenger, the evidence line draws on the canvas AND the challenge
// itself appears here in the sparring bench - its rung, the dimension it questions, the message,
// and the canvas ids it stands on. Keep-or-revise is the human's call; either answer clears the
// card and the evidence line (challenge.answered). Presentation; the answer event is built above.

import type { ChallengeIssuedPayload } from '@procezio/schema'
import { theme } from '../theme.js'

interface ChallengerCardProps {
  challenge: ChallengeIssuedPayload
  onRespond: (response: 'kept' | 'revised') => void
}

const TIER_LABEL: Record<string, string> = {
  probe: 'Probe',
  alert: 'Alert',
  challenge: 'Challenge',
}

export function ChallengerCard({ challenge, onRespond }: ChallengerCardProps) {
  return (
    <div
      role="note"
      aria-label="Challenger interjection"
      style={{
        margin: '10px 12px',
        border: `1.5px solid ${theme.pencil}`,
        background: theme.pencilSoft,
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            borderRadius: 5,
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: theme.friction,
          }}
        >
          C
        </span>
        <strong style={{ fontSize: 12.5, color: '#7A560B' }}>The Challenger</strong>
        <span style={{ fontSize: 10.5, color: theme.textMuted }}>
          {TIER_LABEL[challenge.tier] ?? challenge.tier} · woke on your commit
        </span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: theme.text }}>{challenge.message}</div>
      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 5 }}>
        questions the <strong>{challenge.dimension ?? 'score'}</strong> · stands on{' '}
        {challenge.cited_refs.join(', ')} <em>(the evidence line)</em>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => onRespond('kept')}
          style={{
            fontSize: 11.5,
            border: `1px solid ${theme.border}`,
            background: '#fff',
            borderRadius: 6,
            padding: '3px 10px',
            cursor: 'pointer',
            color: theme.text,
          }}
        >
          Keep my score
        </button>
        <button
          type="button"
          onClick={() => onRespond('revised')}
          style={{
            fontSize: 11.5,
            border: `1px solid ${theme.accent}`,
            background: theme.accent,
            color: theme.onAccent,
            borderRadius: 6,
            padding: '3px 10px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Fair - re-score
        </button>
      </div>
    </div>
  )
}
