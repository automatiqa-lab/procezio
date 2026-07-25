// v0.4 top bar (spec 01b section 8/11, prototype procez-ui-v0.5). Brand, session status, the
// clickable credibility ladder, the live cost meter, the Guided/Express mode toggle
// (disclosure/verbosity - App hides the verbose helper surfaces in Express), and the
// one-pager export - the chrome that frames the canvas. English-only interface by
// decision; the strings still resolve through the i18n dictionary.

import { useEffect, useRef, useState } from 'react'
import { credibilityLadder, type CredibilityLevel } from '@procezio/core'
import type { Canvas } from '@procezio/schema'
import { theme } from '../theme.js'
import { useT } from '../i18n/i18n.js'
import { useModal } from './useModal.js'
import type { Provenance } from '@procezio/schema'

export type Mode = 'guided' | 'express'

interface TopBarProps {
  canvas: Canvas
  /** Two-ink provenance: pencil evidence must not raise the credibility claim. */
  provenance: ReadonlyMap<string, Provenance>
  /** Estimated spend this session in USD, client-computed from LLM metering (0 when offline). */
  costUsd: number
  modelConnected: boolean
  mode: Mode
  onSetMode: (mode: Mode) => void
  onOpenPalette: () => void
  onOpenExport: () => void
  children?: React.ReactNode
}

const LADDER: { level: CredibilityLevel; label: string }[] = [
  { level: 1, label: 'Draft from memory' },
  { level: 2, label: 'Friction-hunted + data-audited' },
  { level: 3, label: 'Doer-verified' },
  { level: 4, label: 'Independently reviewed' },
]

const barBtn = {
  fontSize: 12,
  color: theme.textMuted,
  background: '#fff',
  border: `1px solid ${theme.border}`,
  borderRadius: 16,
  padding: '4px 11px',
  cursor: 'pointer',
} as const

export function TopBar({
  canvas,
  provenance,
  costUsd,
  modelConnected,
  mode,
  onSetMode,
  onOpenPalette,
  onOpenExport,
  children,
}: TopBarProps) {
  const cred = credibilityLadder(canvas, provenance)
  const [credOpen, setCredOpen] = useState(false)
  const credRef = useRef<HTMLDivElement | null>(null)
  const t = useT()
  // Escape-close + focus restore for the popover (it has no inputs, so no trap needed).
  const credModalRef = useModal(credOpen, () => setCredOpen(false))

  useEffect(() => {
    if (!credOpen) return
    const onDoc = (e: MouseEvent) => {
      if (credRef.current && !credRef.current.contains(e.target as Node)) setCredOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [credOpen])

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 46,
        padding: '0 12px',
        borderBottom: `1px solid ${theme.border}`,
        background: theme.surface,
      }}
    >
      <span
        title="Procezio - Process Navigator"
        style={{ fontSize: 16, fontWeight: 700, fontFamily: theme.sans }}
      >
        procez<span style={{ color: theme.accent }}>io</span>
      </span>

      {/* Session status: honest about whether a model is connected. */}
      <span
        title={
          modelConnected
            ? 'A model is connected'
            : 'No model connected - the methodology runs deterministically'
        }
        style={{
          fontSize: 11,
          borderRadius: 16,
          padding: '3px 10px',
          background: modelConnected ? theme.accentSoft : theme.surface2,
          color: modelConnected ? theme.accent : theme.textMuted,
          border: `1px solid ${theme.border}`,
        }}
      >
        {modelConnected ? t('topbar.modelOn') : t('topbar.modelOff')}
      </span>

      {/* Credibility ladder - click to open the L1-L4 breakdown. */}
      <div ref={credRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setCredOpen((o) => !o)}
          aria-expanded={credOpen}
          title={`Credibility: L${cred.level} (${cred.label})`}
          style={{
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 16,
            padding: '4px 10px',
            background: theme.accentSoft,
            color: theme.accent,
            border: `1px solid ${theme.border}`,
            cursor: 'pointer',
          }}
        >
          🛡 L{cred.level} · {cred.claim}
        </button>
        {credOpen && (
          <div
            ref={credModalRef}
            role="dialog"
            aria-label="Credibility ladder"
            style={{
              position: 'absolute',
              top: 32,
              left: 0,
              width: 260,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              padding: 11,
              fontSize: 12,
              zIndex: 80,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Credibility ladder</div>
            {LADDER.map((l) => (
              <div
                key={l.level}
                style={{
                  padding: '4px 6px',
                  borderRadius: 7,
                  margin: '2px 0',
                  background: l.level === cred.level ? theme.accentSoft : 'transparent',
                  fontWeight: l.level === cred.level ? 600 : 400,
                }}
              >
                L{l.level} · {l.label}
                {l.level === cred.level ? ' ← you' : ''}
              </div>
            ))}
            <div style={{ color: theme.textMuted, marginTop: 6 }}>
              Below L3 the export is labelled "draft for verification".
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        title="Command palette (Ctrl/Cmd+K)"
        style={barBtn}
      >
        ⌘K
      </button>

      <div style={{ flex: 1 }} />

      <span
        title="Estimated model spend this session (computed locally, never sent anywhere)"
        style={{ fontSize: 11, color: theme.textMuted, fontFamily: theme.mono }}
      >
        est ${costUsd.toFixed(costUsd < 1 ? 4 : 2)}
      </span>

      {/* Guided vs Express: disclosure/verbosity only, never method order. In Express the
          app hides the orientation hint, the Facilitator panel, and the longer helper copy. */}
      <div
        role="group"
        aria-label="Mode"
        style={{
          display: 'flex',
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          overflow: 'hidden',
          fontSize: 12,
        }}
      >
        {(['guided', 'express'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onSetMode(m)}
            aria-pressed={mode === m}
            style={{
              padding: '5px 11px',
              cursor: 'pointer',
              border: 'none',
              background: mode === m ? theme.text : 'transparent',
              color: mode === m ? theme.bg : theme.textMuted,
            }}
          >
            {m === 'guided' ? t('mode.guided') : t('mode.express')}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onOpenExport}
        title="Export the one-pager"
        style={{
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 16,
          padding: '5px 12px',
          background: theme.accent,
          color: theme.onAccent,
          border: `1px solid ${theme.accent}`,
          cursor: 'pointer',
        }}
      >
        {t('topbar.onePager')}
      </button>

      {children}
    </header>
  )
}
