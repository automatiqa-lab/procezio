// M2-10 - the Zone 7 (Risk gate) surface.
//
// A PURE VIEW over the M2-01 store. The store is never the source of truth: the
// shortlist reads canvas.opportunities (committed ones from zone 6) and the check
// results read canvas.gates (a C9 projection, M2-AMD2). Every check leaves the UI as
// one gate.checked event.
//
//   read : store canvas -> committed opportunities + canvas.gates -> view
//   write: toggle a check / edit a finding -> buildGateCheckedCandidate -> dispatch
//
// The gate BLOCKS the case (spec v0.2 section 6): an opportunity is cleared for its
// zone-8 business case only when all five checks are cleared. Until then it reads
// "Blocked". This is a deterministic, human-set gate - no agent decides pass/fail; the
// agent (later) only nudges open items.
//
// Layering (constitution / AGENTS.md): toggling a check makes no judgement for the
// user. It shapes the candidate; the precompiled ajv validator in the C8 store decides
// acceptance and C9 upserts it into canvas.gates by the (opportunity, check) key.

import { useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { GatePayload as Gate, Opportunity } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { riskPrompts } from '@procezio/core'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import {
  CHECK_INFO,
  GATE_CHECKS,
  type GateStatus,
  allChecksCleared,
  buildGateCheckedCandidate,
  findingOf,
  statusOf,
} from './events.js'

export interface GateZoneProps {
  store: StoreApi<CanvasStoreState>
}

export function GateZone({ store }: GateZoneProps): JSX.Element {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const dispatch = useCanvasStore(store, (s) => s.dispatch)

  const gates = canvas.gates ?? []
  // The shortlist to gate: opportunities the user committed in zone 6.
  const shortlist = (canvas.opportunities ?? []).filter((o) => o.committed === true)
  const canMutate = sessionId !== null

  const setCheck = (
    opportunityId: string,
    check: Gate['check'],
    status: GateStatus,
    finding: string,
  ): void => {
    if (sessionId === null) return
    dispatch(buildGateCheckedCandidate(sessionId, opportunityId, check, status, finding))
  }

  // --- Empty state: no committed shortlist yet. ---------------------------------
  if (shortlist.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          width: '100%',
          overflowY: 'auto',
          boxSizing: 'border-box',
          padding: '16px 18px',
        }}
      >
        <div style={{ maxWidth: 700 }}>
          <ZoneHeader />
          <div
            style={{
              marginTop: 24,
              padding: '22px 24px',
              border: `1px dashed ${theme.border}`,
              borderRadius: 10,
              background: theme.surface,
              fontSize: 15,
              lineHeight: 1.55,
              color: theme.textMuted,
            }}
          >
            Nothing to gate yet. Commit at least one opportunity in <strong>Prioritize</strong>{' '}
            (Zone 6) - you run the five risk checks on the committed shortlist here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '16px 18px',
      }}
    >
      <div style={{ maxWidth: 860 }}>
        <ZoneHeader />
        {(() => {
          // F7 risk-prompt deck: risks the map itself raises, dealt against specific steps.
          const prompts = riskPrompts(canvas)
          return prompts.length > 0 ? (
            <div
              style={{
                marginBottom: 18,
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: '10px 12px',
                background: theme.surface,
              }}
            >
              <div
                style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: theme.friction }}
              >
                Risk prompts from your map ({prompts.length})
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {prompts.slice(0, 6).map((p, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: theme.text, lineHeight: 1.45 }}>
                    <strong>{p.label}:</strong>{' '}
                    <span style={{ color: theme.textMuted }}>{p.prompt}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        })()}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {shortlist.map((o) => (
            <OpportunityGate
              key={o.id}
              opportunity={o}
              gates={gates}
              disabled={!canMutate}
              onSet={setCheck}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// --- One opportunity's five-check gate card. ----------------------------------
interface OpportunityGateProps {
  opportunity: Opportunity
  gates: readonly Gate[]
  disabled: boolean
  onSet: (opportunityId: string, check: Gate['check'], status: GateStatus, finding: string) => void
}

function OpportunityGate({
  opportunity,
  gates,
  disabled,
  onSet,
}: OpportunityGateProps): JSX.Element {
  const cleared = allChecksCleared(gates, opportunity.id)
  const clearedCount = GATE_CHECKS.filter(
    (c) => statusOf(gates, opportunity.id, c) === 'cleared',
  ).length

  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        background: theme.surface,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 18px',
          borderBottom: `1px solid ${theme.border}`,
          background: cleared ? 'rgba(56, 133, 91, 0.08)' : theme.surface2,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
          {opportunity.title}
        </span>
        <span
          style={{
            flex: '0 0 auto',
            fontSize: 12,
            fontWeight: 700,
            color: theme.onAccent,
            background: cleared ? theme.pass : theme.friction,
            borderRadius: 999,
            padding: '3px 12px',
          }}
        >
          {cleared ? 'Cleared for case' : `Blocked · ${clearedCount}/5`}
        </span>
      </div>
      <div style={{ padding: '6px 18px 14px' }}>
        {GATE_CHECKS.map((check) => (
          <CheckRow
            key={check}
            check={check}
            status={statusOf(gates, opportunity.id, check)}
            finding={findingOf(gates, opportunity.id, check)}
            disabled={disabled}
            onStatus={(status, finding) => onSet(opportunity.id, check, status, finding)}
            onFinding={(finding, status) => onSet(opportunity.id, check, status, finding)}
          />
        ))}
      </div>
    </div>
  )
}

// --- One check: title, question, open/cleared toggle, optional finding. -------
interface CheckRowProps {
  check: Gate['check']
  status: GateStatus
  finding: string
  disabled: boolean
  onStatus: (status: GateStatus, finding: string) => void
  onFinding: (finding: string, status: GateStatus) => void
}

function CheckRow({
  check,
  status,
  finding,
  disabled,
  onStatus,
  onFinding,
}: CheckRowProps): JSX.Element {
  const info = CHECK_INFO[check]
  // Local finding buffer, committed on blur (with the current status).
  const [draft, setDraft] = useState(finding)
  // Keep the buffer in sync if the projected finding changes underneath us.
  const [lastSynced, setLastSynced] = useState(finding)
  if (finding !== lastSynced) {
    setLastSynced(finding)
    setDraft(finding)
  }

  const cleared = status === 'cleared'

  return (
    <div style={{ padding: '13px 0', borderBottom: `1px solid ${theme.border}` }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{info.title}</div>
          <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.45, marginTop: 2 }}>
            {info.question}
          </div>
        </div>
        <div style={{ flex: '0 0 auto', display: 'flex', gap: 6 }}>
          {(['open', 'cleared'] as const).map((s) => {
            const active = status === s
            const activeColor = s === 'cleared' ? theme.pass : theme.friction
            return (
              <button
                key={s}
                type="button"
                onClick={() => onStatus(s, draft)}
                disabled={disabled}
                aria-pressed={active}
                style={{
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1px solid ${active ? activeColor : theme.border}`,
                  borderRadius: 999,
                  padding: '5px 14px',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  textTransform: 'capitalize',
                  color: active ? theme.onAccent : theme.text,
                  background: active ? activeColor : '#ffffff',
                }}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== finding.trim()) onFinding(draft, status)
        }}
        aria-label={`${info.title} finding`}
        placeholder={cleared ? 'Note how it clears (optional)' : 'What is the concern? (optional)'}
        disabled={disabled}
        style={{
          marginTop: 10,
          padding: '8px 11px',
          fontSize: 13,
          color: theme.text,
          background: '#ffffff',
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

/** The zone's title block. */
// Compact intro for the frame body (the frame header names the zone).
function ZoneHeader(): JSX.Element {
  return (
    <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 14px', color: theme.textMuted }}>
      Run five risk checks on each committed opportunity. An improvement case stays blocked until
      every check is cleared - honest about what could go wrong before anyone builds anything.
    </p>
  )
}
