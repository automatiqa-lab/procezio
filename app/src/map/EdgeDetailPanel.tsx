// v0.4 - the edge / handoff detail panel (spec 01b section 3, prototype #epanel).
//
// An edge is a first-class handoff object: medium (how the work crosses), trigger (push/pull/
// batch), and - on a Decision's outgoing edges - a branch share. Setting a re-key medium between
// two system-backed steps is what the deterministic HD-2 rule reads to flag a Connect candidate;
// this panel surfaces that flag from core's connectCandidates (no LLM). View-only: edits are
// dispatched by MapZone as an edge upsert.

import { useEffect, useState } from 'react'
import { connectCandidates } from '@procezio/core'
import type { Canvas, Edge } from '@procezio/schema'
import { theme } from '../theme.js'

const MEDIA = ['system', 'mail', 're-key', 'paper', 'walk-over'] as const
const TRIGGERS = ['push', 'pull', 'batch'] as const

interface EdgeDetailPanelProps {
  edge: Edge
  canvas: Canvas
  onSave: (edge: Edge) => void
  /** Delete this handoff (targeted C10 compensation upstream). Redo restores it. */
  onDelete: (edgeId: string) => void
  onClose: () => void
}

export function EdgeDetailPanel({ edge, canvas, onSave, onDelete, onClose }: EdgeDetailPanelProps) {
  const [branch, setBranch] = useState(
    edge.branch_share !== undefined ? String(edge.branch_share) : '',
  )
  useEffect(() => {
    setBranch(edge.branch_share !== undefined ? String(edge.branch_share) : '')
  }, [edge])

  const isConnectCandidate = connectCandidates(canvas).some((c) => c.edge_id === edge.id)

  const setMedium = (m: (typeof MEDIA)[number]): void => onSave({ ...edge, medium: m })
  const setTrigger = (tr: (typeof TRIGGERS)[number]): void => onSave({ ...edge, trigger: tr })
  const commitBranch = (): void => {
    const n = Number(branch)
    if (branch.trim() === '' || Number.isNaN(n)) {
      const { branch_share: _drop, ...rest } = edge
      onSave(rest)
    } else {
      onSave({ ...edge, branch_share: Math.min(100, Math.max(0, n)) })
    }
  }

  const chip = (active: boolean) =>
    ({
      display: 'inline-block',
      fontSize: 11.5,
      fontFamily: theme.sans,
      border: `1px solid ${active ? theme.accent : theme.border}`,
      background: active ? theme.accentSoft : '#fff',
      color: active ? theme.accent : theme.text,
      borderRadius: 8,
      padding: '4px 9px',
      margin: '0 4px 4px 0',
      cursor: 'pointer',
    }) as const
  const groupLabel = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: theme.textMuted,
    margin: '8px 0 4px',
  }

  return (
    <aside
      aria-label="Handoff detail"
      style={{
        width: 300,
        flex: '0 0 300px',
        height: '100%',
        boxSizing: 'border-box',
        overflowY: 'auto',
        background: theme.surface,
        borderLeft: `1px solid ${theme.border}`,
        padding: '18px 18px 28px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700 }}>Handoff</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close handoff detail"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 16,
            color: theme.textMuted,
          }}
        >
          &times;
        </button>
      </div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>
        {edge.from} → {edge.to}
      </div>

      {isConnectCandidate && (
        <div
          role="note"
          style={{
            fontSize: 11.5,
            color: theme.friction,
            background: theme.pencilSoft,
            border: `1px dashed ${theme.pencil}`,
            borderRadius: 8,
            padding: '7px 9px',
            marginBottom: 8,
          }}
        >
          ⚑ Rule HD-2: a re-key handoff between two system-backed steps → Connect candidate.
          Deterministic - no LLM. Handoff count feeds the estimator.
        </div>
      )}

      {/* Real <button>s, not role="button" spans: Enter/Space must work - the medium
          chip is the HD-2 Connect detection's only input, and it was mouse-only. */}
      <div style={groupLabel}>Medium</div>
      <div>
        {MEDIA.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={edge.medium === m}
            onClick={() => setMedium(m)}
            style={chip(edge.medium === m)}
          >
            {m}
          </button>
        ))}
      </div>

      <div style={groupLabel}>Trigger</div>
      <div>
        {TRIGGERS.map((tr) => (
          <button
            key={tr}
            type="button"
            aria-pressed={edge.trigger === tr}
            onClick={() => setTrigger(tr)}
            style={chip(edge.trigger === tr)}
          >
            {tr}
          </button>
        ))}
      </div>

      <div style={groupLabel}>Branch share % (Decision outgoing only)</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="number"
          min={0}
          max={100}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          onBlur={commitBranch}
          aria-label="Branch share percentage"
          style={{
            flex: '1 1 auto',
            padding: '7px 9px',
            fontSize: 13,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            background: '#fff',
          }}
        />
        <button
          type="button"
          onClick={commitBranch}
          style={{
            border: `1px solid ${theme.border}`,
            background: '#fff',
            borderRadius: 6,
            padding: '0 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Set
        </button>
      </div>

      <p style={{ fontSize: 11, color: theme.textMuted, marginTop: 10 }}>
        All fields optional. An empty handoff becomes an Auditor probe, never a blocker.
      </p>

      {/* Delete lives here (edges have no box to grow a hover ✕ on). Append-only:
          it compensates the edge's creation chain, and Redo restores it. */}
      <button
        type="button"
        onClick={() => onDelete(edge.id)}
        style={{
          marginTop: 8,
          width: '100%',
          cursor: 'pointer',
          fontSize: 12.5,
          fontWeight: 600,
          color: theme.friction,
          background: 'transparent',
          border: `1px solid ${theme.friction}`,
          borderRadius: 6,
          padding: '8px 12px',
        }}
      >
        Delete handoff
      </button>
    </aside>
  )
}
