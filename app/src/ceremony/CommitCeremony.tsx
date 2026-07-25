// v0.4 commit ceremony (spec 01b section 5): the deliberate sign + confirm ritual.
//
// Committing scores is not a quiet save - it is a ritual with weight, framed as what it is:
// "only then does the Challenger wake". The modal lists the ideas about to be sealed and
// requires an explicit Sign; that writes the irreversible commitment event. As the app's
// most consequential dialog it gets full focus management (useModal): Escape backs out,
// Tab stays inside, focus returns to the invoker on close.

import { theme } from '../theme.js'
import { ModalOverlay } from '../canvas/ModalOverlay.js'
import { useT } from '../i18n/i18n.js'

interface CommitCeremonyProps {
  open: boolean
  /** The committed ideas about to be sealed. */
  titles: string[]
  onSign: () => void
  onClose: () => void
}

export function CommitCeremony({ open, titles, onSign, onClose }: CommitCeremonyProps) {
  const t = useT()
  if (!open) return null

  return (
    <ModalOverlay
      label="Commit ceremony"
      onClose={onClose}
      zIndex={60}
      width="min(460px, 92vw)"
      padding="22px 24px"
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.accent,
          marginBottom: 8,
        }}
      >
        {t('ceremony.eyebrow')}
      </div>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px' }}>{t('ceremony.title')}</h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: theme.textMuted, margin: '0 0 14px' }}>
        {t('ceremony.body')}
      </p>
      <ul style={{ listStyle: 'none', margin: '0 0 18px', padding: 0, display: 'grid', gap: 6 }}>
        {titles.length === 0 && (
          <li style={{ fontSize: 13, color: theme.textFaint }}>{t('ceremony.empty')}</li>
        )}
        {titles.map((title, i) => (
          <li
            key={i}
            style={{
              fontSize: 13,
              padding: '7px 10px',
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              background: theme.surface2,
            }}
          >
            {title}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: `1px solid ${theme.border}`,
            background: 'transparent',
            color: theme.textMuted,
            borderRadius: 8,
            padding: '9px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {t('ceremony.notYet')}
        </button>
        <button
          type="button"
          onClick={onSign}
          disabled={titles.length === 0}
          style={{
            border: `1px solid ${theme.accent}`,
            background: titles.length === 0 ? theme.surface2 : theme.accent,
            color: titles.length === 0 ? theme.textFaint : theme.onAccent,
            borderRadius: 8,
            padding: '9px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: titles.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {t('ceremony.sign')}
        </button>
      </div>
    </ModalOverlay>
  )
}
