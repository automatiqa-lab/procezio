// v0.4 re-assessment diff modal (spec 01b Wave 3 G5): what changed since a prior session.
// Presentation only - it renders a deterministic SessionDiff (core sessionDiff). Read-only.

import type { ReviewSchedule, SessionDiff } from '@procezio/core'
import { theme } from '../theme.js'
import { ModalOverlay } from '../canvas/ModalOverlay.js'

interface ReassessDiffProps {
  diff: SessionDiff
  schedule: ReviewSchedule
  priorName: string
  onClose: () => void
}

export function ReassessDiff({ diff, schedule, priorName, onClose }: ReassessDiffProps) {
  const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)
  const rows: Array<[string, string]> = [
    ['Steps added', signed(diff.nodesAdded)],
    ['Steps removed', signed(-diff.nodesRemoved)],
    ['Steps relabelled', `${diff.nodesRelabeled}`],
    ['Ideas raised', signed(diff.ideasAdded)],
    ['Commitments', signed(diff.committedDelta)],
    ['Friction pins', signed(diff.frictionDelta)],
    ['Cases drafted', signed(diff.casesDelta)],
  ]
  return (
    <ModalOverlay
      label="Re-assessment diff"
      onClose={onClose}
      zIndex={60}
      width="min(480px, 94vw)"
      padding="20px 22px"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <strong style={{ fontSize: 14 }}>Re-assessment</strong>
        <span style={{ fontSize: 11, color: theme.textMuted }}>vs {priorName}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
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
      <div
        style={{
          fontSize: 13,
          color: theme.text,
          padding: '8px 0',
          marginBottom: 6,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        Credibility{' '}
        <strong>
          L{diff.credibilityFrom} → L{diff.credibilityTo}
        </strong>{' '}
        {diff.credibilityTo > diff.credibilityFrom
          ? '(stronger)'
          : diff.credibilityTo < diff.credibilityFrom
            ? '(weaker)'
            : '(unchanged)'}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {rows.map(([label, val]) => (
          <li
            key={label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              color: theme.textMuted,
            }}
          >
            <span>{label}</span>
            <span style={{ fontFamily: theme.mono, color: theme.text }}>{val}</span>
          </li>
        ))}
      </ul>
      {/* G4: SM-2-style next-review suggestion, modulated by ledger confidence. */}
      <div
        style={{
          marginTop: 12,
          padding: '8px 10px',
          borderRadius: 8,
          background: theme.accentSoft,
          fontSize: 12.5,
          color: theme.text,
        }}
      >
        Suggested next re-assessment: <strong>~{schedule.days} days</strong>
        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{schedule.reason}</div>
      </div>
    </ModalOverlay>
  )
}
