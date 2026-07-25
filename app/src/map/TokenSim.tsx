// v0.4 token simulation (spec 01b Wave 2 F2): an own, lightweight animator that plays a unit of
// work through the map. A self-contained SVG panel (NOT coupled to the React Flow transform):
// nodes are drawn at their derived layout positions, scaled to fit, and a token dot travels the
// deterministic route (tokenRoute.flowRoute) via requestAnimationFrame. Presentation only; it reads
// geometry + the route and animates - it dispatches nothing.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Canvas } from '@procezio/schema'
import { theme } from '../theme.js'
import { layoutNodes } from './layout.js'
import { ModalOverlay } from '../canvas/ModalOverlay.js'
import { flowRoute } from './tokenRoute.js'

interface TokenSimProps {
  canvas: Canvas
  onClose: () => void
}

const W = 560
const H = 320
const PAD = 34
const SPEED = 0.55 // route-nodes per second

export function TokenSim({ canvas, onClose }: TokenSimProps) {
  // Scaled node positions + the route, computed once from the current map.
  const { pts, route, labels } = useMemo(() => {
    const positions = layoutNodes(canvas)
    const byId = new Map(positions.map((p) => [p.id, p]))
    const xs = positions.map((p) => p.x)
    const ys = positions.map((p) => p.y)
    const minX = Math.min(...xs, 0)
    const minY = Math.min(...ys, 0)
    const spanX = Math.max(1, Math.max(...xs, 1) - minX)
    const spanY = Math.max(1, Math.max(...ys, 1) - minY)
    const sx = (W - PAD * 2) / spanX
    const sy = (H - PAD * 2) / spanY
    const pts = new Map<string, { x: number; y: number }>()
    for (const p of positions) {
      pts.set(p.id, { x: PAD + (p.x - minX) * sx, y: PAD + (p.y - minY) * sy })
    }
    const route = flowRoute(canvas).filter((id) => byId.has(id))
    const labels = new Map((canvas.nodes ?? []).map((n) => [n.id, n.label || n.id]))
    return { pts, route, labels }
  }, [canvas])

  const [playing, setPlaying] = useState(true)
  // progress in route-node units (0 .. route.length-1); a ref so the rAF loop is not re-created.
  const progress = useRef(0)
  const [token, setToken] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!playing || route.length < 2) return
    let raf = 0
    let last: number | null = null
    const step = (t: number): void => {
      if (last !== null) progress.current += (SPEED * (t - last)) / 1000
      last = t
      if (progress.current >= route.length - 1) progress.current = 0 // loop
      const i = Math.floor(progress.current)
      const frac = progress.current - i
      const a = pts.get(route[i]!)
      const b = pts.get(route[Math.min(i + 1, route.length - 1)]!)
      if (a && b) setToken({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, route, pts])

  const edges = (canvas.edges ?? []).filter((e) => e.kind !== 'exception-backedge')

  return (
    <ModalOverlay label="Token simulation" onClose={onClose} zIndex={60} padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>Token simulation</strong>
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          one unit of work through the flow - a picture, not a measurement
        </span>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          style={pillBtn}
          aria-pressed={playing}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button type="button" onClick={onClose} style={pillBtn} aria-label="Close">
          ✕
        </button>
      </div>
      {route.length < 2 ? (
        <div style={{ width: W, fontSize: 13, color: theme.textMuted, padding: '30px 0' }}>
          Add a few connected steps (a Start and an edge or two) to watch a token flow.
        </div>
      ) : (
        <svg width={W} height={H} style={{ background: theme.bg, borderRadius: 10 }}>
          {edges.map((e) => {
            const a = pts.get(e.from)
            const b = pts.get(e.to)
            return a && b ? (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={theme.border}
                strokeWidth={1.5}
              />
            ) : null
          })}
          {[...pts.entries()].map(([id, p]) => (
            <g key={id}>
              <circle cx={p.x} cy={p.y} r={7} fill={theme.surface} stroke={theme.textMuted} />
              <text x={p.x + 11} y={p.y + 4} fontSize={10.5} fill={theme.textMuted}>
                {(labels.get(id) ?? '').slice(0, 16)}
              </text>
            </g>
          ))}
          {token && <circle cx={token.x} cy={token.y} r={6} fill={theme.accent} />}
        </svg>
      )}
    </ModalOverlay>
  )
}

const pillBtn: React.CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: '#fff',
  borderRadius: 999,
  padding: '3px 11px',
  fontSize: 12,
  cursor: 'pointer',
  color: theme.text,
}
