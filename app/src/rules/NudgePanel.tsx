// M2-13 - the agent nudge strip (top of the right panel).
//
// A PURE VIEW over the store's derived nudges. It shows the deterministic rule
// firings (message_template verbatim, since there is no LLM to reword them yet) with
// a dismiss control, plus an interjection-budget indicator (pips). The "◆ agent"
// framing matches the ratified prototype's agent panel; the chat surface arrives with
// the LLM task layer, at which point these same nudges gain reworded language.
//
// Layering: this panel decides nothing. WHICH rules fired is the C12 engine's call
// (in the store); this only renders them and lets the human dismiss.

import type { StoreApi } from 'zustand/vanilla'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { BUDGET_PER_CLASS, type Nudge } from './nudges.js'
import { theme } from '../theme.js'

export interface NudgePanelProps {
  store: StoreApi<CanvasStoreState>
  /** LLM-reworded text per rule_id (C-TASK). Falls back to the rule's message_template. */
  overrides?: Record<string, string>
}

/** Severity accent: a challenge is weightier than a nudge. */
function severityColor(s: Nudge['severity']): string {
  if (s === 'challenge' || s === 'block') return theme.friction
  if (s === 'info') return theme.textMuted
  return theme.pencil
}

export function NudgePanel({ store, overrides }: NudgePanelProps): JSX.Element | null {
  const nudges = useCanvasStore(store, (s) => s.nudges)
  const dismiss = useCanvasStore(store, (s) => s.dismissNudge)

  if (nudges.length === 0) return null

  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.border}`,
        background: theme.surface2,
        flex: '0 0 auto',
        maxHeight: '46%',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 8px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: theme.pencil,
          }}
        >
          ◆ Agent nudges
        </div>
        {/* Interjection budget pips: filled = an active nudge, hollow = headroom. */}
        <div
          aria-label="interjection budget"
          style={{ display: 'flex', gap: 4, alignItems: 'center' }}
          title="interjection budget"
        >
          {Array.from({ length: BUDGET_PER_CLASS }, (_, i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: i < nudges.length ? theme.pencil : 'transparent',
                border: `1px solid ${theme.pencil}`,
                display: 'inline-block',
              }}
            />
          ))}
        </div>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '0 14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {nudges.map((n) => (
          <li
            key={n.rule_id}
            style={{
              padding: '10px 11px',
              border: `1px solid ${theme.pencil}`,
              borderLeft: `3px solid ${severityColor(n.severity)}`,
              borderRadius: 8,
              background: theme.pencilSoft,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: severityColor(n.severity),
                }}
              >
                {n.severity}
              </span>
              <button
                type="button"
                onClick={() => dismiss(n.rule_id)}
                aria-label={`Dismiss the ${n.rule_id} nudge`}
                style={{
                  cursor: 'pointer',
                  border: 'none',
                  background: 'transparent',
                  color: theme.textMuted,
                  fontSize: 15,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.45 }}>
              {overrides?.[n.rule_id] ?? n.message}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
