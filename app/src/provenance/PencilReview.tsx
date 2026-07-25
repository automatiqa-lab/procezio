// M2-16 - the pencil review panel: accept/reject the agent's pending contributions.
//
// The two-ink rule made visible (constitution p5, v0.3 A3): every agent contribution is
// born pencil and shown here for a DELIBERATE, per-item decision - accept (-> ink) or
// reject (-> removed). There is intentionally NO bulk-accept: each pencil item requires
// its own action, so the human stays the author of the canvas.
//
// A PURE VIEW over store.pencilItems; the accept/reject actions dispatch flag.accepted
// events. Renders nothing when there is nothing pending.

import type { StoreApi } from 'zustand/vanilla'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'

export interface PencilReviewProps {
  store: StoreApi<CanvasStoreState>
}

export function PencilReview({ store }: PencilReviewProps): JSX.Element | null {
  const items = useCanvasStore(store, (s) => s.pencilItems)
  const accept = useCanvasStore(store, (s) => s.acceptPencil)
  const reject = useCanvasStore(store, (s) => s.rejectPencil)

  if (items.length === 0) return null

  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.border}`,
        background: theme.pencilSoft,
        flex: '0 0 auto',
        maxHeight: '46%',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '14px 16px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
          ✎ Pencil - review each
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: theme.pencil }}>{items.length}</span>
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
        {items.map((item) => (
          <li
            key={item.targetEventId}
            style={{
              padding: '10px 11px',
              border: `1px solid ${theme.pencil}`,
              borderRadius: 8,
              background: '#ffffff',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: theme.pencil,
                marginBottom: 3,
              }}
            >
              {item.kind}
            </div>
            <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.4, marginBottom: 8 }}>
              {item.label}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => accept(item.targetEventId)}
                aria-label={`Accept ${item.label}`}
                style={{
                  flex: 1,
                  cursor: 'pointer',
                  border: `1px solid ${theme.pass}`,
                  borderRadius: 6,
                  padding: '5px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: theme.onAccent,
                  background: theme.pass,
                }}
              >
                ✓ Accept
              </button>
              <button
                type="button"
                onClick={() => reject(item.targetEventId)}
                aria-label={`Reject ${item.label}`}
                style={{
                  flex: 1,
                  cursor: 'pointer',
                  border: `1px solid ${theme.friction}`,
                  borderRadius: 6,
                  padding: '5px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: theme.friction,
                  background: '#ffffff',
                }}
              >
                ✕ Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
