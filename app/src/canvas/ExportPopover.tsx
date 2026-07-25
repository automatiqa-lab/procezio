// v0.4 one-pager export (spec 01b section 11, prototype #export). The credibility header leads
// the preview; the Auditor gate lists what's unresolved BEFORE export and blocks it. Export
// renders the self-contained one-pager SVG to PNG / 16:9 slide / PDF entirely in the browser
// (export/render.ts) - zero dependencies, zero egress.

import { useMemo } from 'react'
import {
  exportBlockers,
  credibilityLadder,
  boardReviewFlags,
  continuityChecks,
} from '@procezio/core'
import type { Canvas } from '@procezio/schema'
import { theme } from '../theme.js'
import { toast } from './toast.js'
import { ModalOverlay } from './ModalOverlay.js'
import type { OnePagerFormat } from '../export/render.js'
import type { Provenance } from '@procezio/schema'

interface ExportPopoverProps {
  open: boolean
  canvas: Canvas
  /** Two-ink provenance: pencil evidence must not raise the exported credibility claim. */
  provenance: ReadonlyMap<string, Provenance>
  onClose: () => void
}

export function ExportPopover({ open, canvas, provenance, onClose }: ExportPopoverProps) {
  // The derived audit block walks the whole canvas; memoized on it so re-renders that do
  // not change the canvas skip the walk. Placed before the early return (hooks rules).
  const audit = useMemo(
    () => ({
      cred: credibilityLadder(canvas, provenance),
      blockers: exportBlockers(canvas),
      // The Auditor's pre-share pass: board-review inconsistencies + continuity contradictions (B9).
      reviewFlags: [
        ...boardReviewFlags(canvas).map((f) => f.message),
        ...continuityChecks(canvas).map((f) => f.message),
      ],
      figures: (canvas.cases ?? []).flatMap((c) => c.figures ?? []),
    }),
    [canvas],
  )
  if (!open) return null

  const { cred, blockers, reviewFlags, figures } = audit
  const assumptions = canvas.assumptions ?? []
  const verified = assumptions.filter((a) => a.confidence === 'high').length
  const assumed = assumptions.length - verified
  const simulated = (canvas.simulated_perspectives ?? []).filter((s) => s.confirmed !== true).length
  const northStar = canvas.process?.north_star ?? ''

  return (
    <ModalOverlay
      label="Export the one-pager"
      onClose={onClose}
      zIndex={70}
      align="right"
      width={320}
      padding={14}
      backdropOpacity={0.28}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        One-pager{northStar ? ` - ${northStar}` : ''}
      </div>
      <div
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: 9,
          background: theme.bg,
          padding: 10,
          fontSize: 11,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            background: theme.accentSoft,
            borderRadius: 6,
            padding: '5px 7px',
            marginBottom: 6,
          }}
        >
          <strong>Credibility:</strong> {figures.length} figure{figures.length === 1 ? '' : 's'} ·{' '}
          {verified} verified · {assumed} assumed
          {simulated > 0 ? ` · ${simulated} simulated` : ''} · L{cred.level} {cred.label}
        </div>
        North-star + delta · map thumbnail · top opportunities · The Ask · ledger annex ·{' '}
        <em>made with Procezio</em>
      </div>

      {blockers.length > 0 ? (
        <div
          role="note"
          style={{
            fontSize: 11.5,
            color: theme.friction,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: '7px 9px',
            marginBottom: 8,
          }}
        >
          <strong>Auditor gate - resolve first:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {blockers.slice(0, 4).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: theme.pass, marginBottom: 8 }}>
          ✓ Nothing blocks export - every figure is sourced and every assumption acknowledged.
        </div>
      )}

      {/* Board-review pass (E6): inconsistency flags a target authority would catch. */}
      {reviewFlags.length > 0 && (
        <div
          role="note"
          style={{
            fontSize: 11.5,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: '7px 9px',
            marginBottom: 8,
          }}
        >
          <strong>Board review - likely to be questioned:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {reviewFlags.slice(0, 5).map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {(
          [
            ['png', 'PNG'],
            ['pdf', 'PDF'],
            ['slide', '16:9'],
          ] as Array<[OnePagerFormat, string]>
        ).map(([fmt, label]) => (
          <button
            key={fmt}
            type="button"
            disabled={blockers.length > 0}
            onClick={() => {
              // Lazy-load the rasterizer so the export code (and its SVG composer) stays out of
              // the initial bundle - it is only needed on this click.
              void import('../export/render.js')
                .then(({ exportOnePager }) => exportOnePager(canvas, fmt, provenance))
                .then((name) =>
                  toast(`Exported ${name}. Works offline - nothing left this browser.`),
                )
                .catch(() => toast('Export failed - the one-pager could not be rendered.'))
              onClose()
            }}
            style={{
              flex: '1 1 0',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              padding: '9px 0',
              background: blockers.length > 0 ? theme.surface2 : theme.accent,
              color: blockers.length > 0 ? theme.textFaint : theme.onAccent,
              border: `1px solid ${blockers.length > 0 ? theme.border : theme.accent}`,
              cursor: blockers.length > 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: theme.textMuted, marginTop: 6 }}>
        🔒 Data stays in this browser. The export is labelled with its credibility level.
      </p>
    </ModalOverlay>
  )
}
