// M2-14 - the undo/redo control (provenance/history surface).
//
// A PURE VIEW over the store's canUndo/canRedo flags. Undo/redo append compensating
// events (C10) through the store; this only offers the affordance and binds the
// keyboard shortcuts. Everything the human draws is reversible with full history - the
// event log is never rewritten, only extended (constitution p5: full undo).

import { useEffect } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'

export interface HistoryBarProps {
  store: StoreApi<CanvasStoreState>
}

export function HistoryBar({ store }: HistoryBarProps): JSX.Element {
  const canUndo = useCanvasStore(store, (s) => s.canUndo)
  const canRedo = useCanvasStore(store, (s) => s.canRedo)
  const undo = useCanvasStore(store, (s) => s.undo)
  const redo = useCanvasStore(store, (s) => s.redo)

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) = redo. Skip while typing in a
  // field so undo never eats text edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const btn = (enabled: boolean): React.CSSProperties => ({
    flex: 1,
    cursor: enabled ? 'pointer' : 'default',
    border: `1px solid ${theme.border}`,
    borderRadius: 7,
    padding: '7px 10px',
    fontSize: 12,
    fontWeight: 700,
    color: enabled ? theme.text : theme.textFaint,
    background: enabled ? '#ffffff' : theme.surface2,
  })

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '10px 14px',
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <button
        type="button"
        onClick={() => undo()}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        style={btn(canUndo)}
      >
        ↶ Undo
      </button>
      <button
        type="button"
        onClick={() => redo()}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        style={btn(canRedo)}
      >
        Redo ↷
      </button>
    </div>
  )
}
