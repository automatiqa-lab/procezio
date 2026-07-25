// v0.4 minimap (spec 01b section 2, A8): a small overview of the widget frames + the current
// viewport, click to jump. Presentation only - it reads geometry + the camera and moves the camera.

import { theme } from '../theme.js'
import type { Camera, FrameLayout } from './geometry.js'

interface MinimapProps {
  frames: readonly FrameLayout[]
  camera: Camera
  viewportW: number
  viewportH: number
  onNavigate: (worldX: number, worldY: number) => void
}

const W = 168
const H = 116
const PAD = 6

export function Minimap({ frames, camera, viewportW, viewportH, onNavigate }: MinimapProps) {
  if (frames.length === 0) return null
  // World bounds across all frames + the current viewport, so the visible box always fits.
  const viewLeft = camera.x
  const viewTop = camera.y
  const viewW = viewportW / camera.zoom
  const viewH = viewportH / camera.zoom
  const minX = Math.min(...frames.map((f) => f.x), viewLeft)
  const minY = Math.min(...frames.map((f) => f.y), viewTop)
  const maxX = Math.max(...frames.map((f) => f.x + f.w), viewLeft + viewW)
  const maxY = Math.max(...frames.map((f) => f.y + f.h), viewTop + viewH)
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const s = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY)
  const px = (wx: number): number => PAD + (wx - minX) * s
  const py = (wy: number): number => PAD + (wy - minY) * s

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const worldX = minX + (e.clientX - rect.left - PAD) / s
    const worldY = minY + (e.clientY - rect.top - PAD) / s
    onNavigate(worldX, worldY)
  }

  return (
    // Decorative for assistive tech: the ZoneRail is the accessible navigation path
    // (a real <nav> with buttons + aria-current); exposing a click-only SVG would only
    // announce a control keyboard users cannot operate.
    <svg
      width={W}
      height={H}
      onClick={onClick}
      aria-hidden="true"
      style={{
        position: 'absolute',
        right: 12,
        bottom: 54,
        zIndex: 20,
        background: 'rgba(255,255,255,0.9)',
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        cursor: 'pointer',
      }}
    >
      {frames.map((f) => (
        <rect
          key={f.id}
          x={px(f.x)}
          y={py(f.y)}
          width={f.w * s}
          height={f.h * s}
          rx={2}
          fill={theme.surface2}
          stroke={theme.border}
        />
      ))}
      {/* The current viewport. */}
      <rect
        x={px(viewLeft)}
        y={py(viewTop)}
        width={viewW * s}
        height={viewH * s}
        fill="none"
        stroke={theme.accent}
        strokeWidth={1.5}
      />
    </svg>
  )
}
