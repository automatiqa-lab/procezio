// v0.4 benchmark shelf UI (spec 01b Wave 2 E7). Shows cited public ranges for the process type
// and lets you PULL one as a starting estimate. Never auto-filled: pulling adds a low-confidence
// assumption with a "localize" verify plan, so the export gate keeps flagging it until you
// replace it with your own number.

import type { StoreApi } from 'zustand/vanilla'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import { toast } from '../canvas/toast.js'
import { buildAssumptionAddedCandidate } from '../assumptions/events.js'
import { benchmarksFor, type Benchmark } from './benchmarks.js'

interface BenchmarkShelfProps {
  store: StoreApi<CanvasStoreState>
}

export function BenchmarkShelf({ store }: BenchmarkShelfProps) {
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const processName = useCanvasStore(store, (s) => getCanvas(s).process?.name) ?? ''
  const benchmarks = benchmarksFor(processName)
  if (benchmarks.length === 0) return null

  const pull = (b: Benchmark): void => {
    if (sessionId === null) return
    store.getState().dispatch(
      buildAssumptionAddedCandidate(sessionId, {
        statement: `${b.metric}: ${b.range} (benchmark, not yet localized)`,
        source: b.source,
        confidence: 'low',
        verify_by: 'Replace with your own measured number before you rely on it.',
      }),
    )
    toast('Pulled as a starting estimate - localize it with your own numbers before export.')
  }

  return (
    <div style={{ marginTop: 20, borderTop: `1px solid ${theme.border}`, paddingTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Benchmark shelf</div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
        Rough public ranges for this process type - cited, never invented. Pull one as a starting
        estimate, then localize it with your own numbers. It stays flagged until you do.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {benchmarks.map((b, i) => (
          <li
            key={i}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '9px 11px',
              background: theme.surface,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>{b.metric}</strong>
              <span style={{ fontSize: 13, color: theme.accent, fontFamily: theme.mono }}>
                {b.range}
              </span>
              <button
                type="button"
                onClick={() => pull(b)}
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  color: theme.accent,
                  background: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                Pull as estimate
              </button>
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{b.note}</div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
              source: {b.source}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
