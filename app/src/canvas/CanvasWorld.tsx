// v0.4 one-canvas surface: the infinite pannable/zoomable world (spec 01b section 2).
//
// A full-bleed viewport hosting a `world` layer transformed by the camera. Wheel zooms toward
// the cursor; dragging empty canvas pans. Frames (children) are positioned in world
// coordinates and ride the transform. This is presentation only - it dispatches no methodology
// events; navigation is camera movement, nothing more.

import { useEffect, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { theme } from '../theme.js'
import type { Camera } from './geometry.js'

interface CanvasWorldProps {
  camera: Camera
  panBy: (dx: number, dy: number) => void
  zoomAt: (factor: number, screenX: number, screenY: number) => void
  children: ReactNode
}

export function CanvasWorld({ camera, panBy, zoomAt, children }: CanvasWorldProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const pan = useRef<{ x: number; y: number } | null>(null)

  // Native wheel listener so we can preventDefault (React's onWheel is passive).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // A purely horizontal trackpad scroll (deltaY 0, deltaX set) is a PAN, not a zoom: the old
      // `deltaY < 0 ? in : out` read deltaY === 0 as "zoom out" while preventDefault swallowed
      // the sideways gesture entirely. panBy takes screen px and moves the camera against the
      // delta, so the content scrolls the way the fingers say (deltaX > 0 pans the view right).
      // Pinch-zoom still lands on the zoom path: trackpads deliver it as wheel + ctrlKey with a
      // real deltaY. Vertical wheel = zoom toward the cursor, exactly as before.
      if (e.deltaY === 0) {
        if (e.deltaX !== 0) panBy(-e.deltaX, 0)
        return // both deltas zero: nothing to do
      }
      const rect = el.getBoundingClientRect()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, panBy])

  const onPointerDown = (e: ReactPointerEvent) => {
    // Only start a pan when the press is on the empty canvas, not on a frame.
    if (e.target !== e.currentTarget) return
    pan.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pan.current) return
    panBy(e.clientX - pan.current.x, e.clientY - pan.current.y)
    pan.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    pan.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label="Process canvas"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        cursor: 'grab',
        background: theme.bg,
        // A faint world grid that pans with the camera (parallax anchored to world origin).
        backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
        backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
        backgroundPosition: `${-camera.x * camera.zoom}px ${-camera.y * camera.zoom}px`,
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  )
}
