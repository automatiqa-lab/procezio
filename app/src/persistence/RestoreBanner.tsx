// The autosave restore offer - shown once on a fresh launch when a previous session's
// autosave exists. Restoring replays the log through the same full validation an opened
// .pnav gets; discarding clears the slot so the offer never nags. Presentation only.

import { theme } from '../theme.js'
import { useT } from '../i18n/i18n.js'

interface RestoreBannerProps {
  /** How many events the autosaved session carries (shown so the offer is concrete). */
  eventCount: number
  onRestore: () => void
  onDiscard: () => void
}

export function RestoreBanner({ eventCount, onRestore, onDiscard }: RestoreBannerProps) {
  const t = useT()
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: 54,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 41,
        width: 'min(480px, 92vw)',
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
          AUTOSAVE
        </span>
        <strong style={{ fontSize: 14 }}>{t('restore.title')}</strong>
      </div>
      <p style={{ margin: '8px 0 12px', color: theme.textMuted }}>
        {t('restore.body', { n: eventCount })}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onDiscard}
          style={{
            border: `1px solid ${theme.border}`,
            background: 'transparent',
            color: theme.textMuted,
            borderRadius: 8,
            padding: '7px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {t('restore.discard')}
        </button>
        <button
          type="button"
          onClick={onRestore}
          style={{
            border: `1px solid ${theme.accent}`,
            background: theme.accent,
            color: theme.onAccent,
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('restore.restore')}
        </button>
      </div>
    </div>
  )
}
