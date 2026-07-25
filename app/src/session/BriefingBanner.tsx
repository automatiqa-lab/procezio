// v0.4 re-entry briefing banner (spec 01b section 12, G2). Shown when a session with content is
// (re)loaded: a dismissable Facilitator note of what is done, the top open gaps, and the next
// step. Presentation only - it reads the deterministic briefing and renders it.

import { theme } from '../theme.js'
import type { ReEntryBriefing } from './briefing.js'

interface BriefingBannerProps {
  briefing: ReEntryBriefing | null
  onDismiss: () => void
}

export function BriefingBanner({ briefing, onDismiss }: BriefingBannerProps) {
  if (briefing === null || !briefing.hasContent) return null
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: 54,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        width: 'min(560px, 92vw)',
        background: theme.surface,
        border: `1px solid ${theme.accent}`,
        borderRadius: 12,
        boxShadow: '0 14px 40px rgba(0,0,0,0.18)',
        padding: '14px 16px',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: theme.accent }}>
          FACILITATOR
        </span>
        <strong style={{ fontSize: 14 }}>{briefing.headline}</strong>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss briefing"
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: theme.textMuted,
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      {briefing.done.length > 0 && (
        <p style={{ margin: '8px 0 0', color: theme.textMuted }}>
          So far: {briefing.done.join(' · ')}.
        </p>
      )}
      {briefing.missing.length > 0 && (
        <p style={{ margin: '6px 0 0', color: theme.textMuted }}>
          Still open: {briefing.missing.join(' · ')}.
        </p>
      )}
      <p style={{ margin: '8px 0 0', color: theme.text, fontWeight: 600 }}>{briefing.next}</p>
    </div>
  )
}
