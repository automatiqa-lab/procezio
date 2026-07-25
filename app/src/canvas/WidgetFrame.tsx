// v0.4 one-canvas widget frame: a movable methodology zone on the infinite surface.
//
// Each of the eight zones (plus the Shoebox) is a frame with a draggable header and a body
// holding that zone's content. Dragging the header moves the frame (a presentation fact, via
// onMove). A locked frame is an affordance gate (spec 01b section 2, A4): it renders visibly
// locked with the reason stated, and its body is not interactive until the invariant is met.

import { useEffect, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { theme } from '../theme.js'
import type { FrameLayout } from './geometry.js'

interface WidgetFrameProps {
  frame: FrameLayout
  zoom: number
  active: boolean
  /** When set, the frame is an affordance-locked gate; the string is the reason shown. */
  lockedReason?: string | undefined
  onMove: (x: number, y: number) => void
  onResize: (w: number, h: number) => void
  /** Fired when a resize drag ends, so the parent can re-align the other frames. */
  onResizeEnd: () => void
  /** Reports the frame's actual rendered height (world units) whenever it changes. */
  onHeightChange: (h: number) => void
  onFocus: () => void
  children: ReactNode
}

export function WidgetFrame({
  frame,
  zoom,
  active,
  lockedReason,
  onMove,
  onResize,
  onResizeEnd,
  onHeightChange,
  onFocus,
  children,
}: WidgetFrameProps) {
  const drag = useRef<{ startX: number; startY: number; frameX: number; frameY: number } | null>(
    null,
  )
  const resize = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  // The latest report callback behind a ref, so the observer below attaches exactly once.
  const reportRef = useRef(onHeightChange)
  useEffect(() => {
    reportRef.current = onHeightChange
  }, [onHeightChange])

  // Content-fit frames render at their body's height, not at frame.h - so the rendered height is
  // the truth, and the view layer needs to hear it (grip seed, minimap, evidence line, camera
  // centring, overlap arranging all read frame heights). ResizeObserver hands back LAYOUT sizes,
  // which the world layer's scale() transform never touches: borderBoxSize is already world
  // units - no division by zoom, and no re-report needed when only the zoom changes. Reports are
  // coalesced to one per animation frame and the view layer drops sub-half-unit changes; between
  // the two there is no loop, because a report never changes THIS frame's rendered size
  // (content-fit rendering ignores frame.h, and sized frames render at their declared h anyway).
  useEffect(() => {
    const el = sectionRef.current
    if (el === null) return undefined
    let raf = 0
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry === undefined) return
      const box = entry.borderBoxSize[0]
      const h = box !== undefined ? box.blockSize : el.offsetHeight
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => reportRef.current(h))
    })
    observer.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  const onHeaderPointerDown = (e: ReactPointerEvent) => {
    e.stopPropagation()
    onFocus()
    drag.current = { startX: e.clientX, startY: e.clientY, frameX: frame.x, frameY: frame.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHeaderPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    // Screen delta -> world delta (the world is scaled by zoom).
    const dx = (e.clientX - drag.current.startX) / zoom
    const dy = (e.clientY - drag.current.startY) / zoom
    onMove(drag.current.frameX + dx, drag.current.frameY + dy)
  }
  const onHeaderPointerUp = (e: ReactPointerEvent) => {
    drag.current = null
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }

  // The bottom-right resize grip: drag to set an explicit size (screen delta -> world delta by the
  // camera zoom). Once resized, the frame honours w/h verbatim (see `sized` below). The seed is
  // frame.h as handed down by the view - the EFFECTIVE (measured) height for a content-fit frame -
  // so the very first drag pixel continues from what is on screen instead of snapping the frame
  // back to a stale declared height.
  const onResizePointerDown = (e: ReactPointerEvent) => {
    e.stopPropagation()
    onFocus()
    resize.current = { startX: e.clientX, startY: e.clientY, w: frame.w, h: frame.h }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onResizePointerMove = (e: ReactPointerEvent) => {
    if (!resize.current) return
    const dw = (e.clientX - resize.current.startX) / zoom
    const dh = (e.clientY - resize.current.startY) / zoom
    onResize(resize.current.w + dw, resize.current.h + dh)
  }
  const onResizePointerUp = (e: ReactPointerEvent) => {
    if (resize.current) onResizeEnd()
    resize.current = null
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }

  const locked = lockedReason !== undefined
  // Most frames size to their content (no half-empty box, no scrollbar on normal content); a very
  // long body still caps at maxHeight and scrolls rather than growing without bound. Two exceptions
  // take an explicit height: the map (it embeds a React Flow viewport that needs a definite height)
  // and any frame the user has resized with the grip (frame.sized).
  const fitContent = frame.zone !== 2 && frame.sized !== true
  const CONTENT_CAP = 760

  return (
    <section
      ref={sectionRef}
      aria-label={frame.title}
      data-frame-id={frame.id}
      style={{
        position: 'absolute',
        left: frame.x,
        top: frame.y,
        width: frame.w,
        ...(fitContent ? { maxHeight: CONTENT_CAP } : { height: frame.h }),
        display: 'flex',
        flexDirection: 'column',
        background: theme.surface,
        border: `1.5px solid ${active ? theme.accent : theme.border}`,
        borderRadius: 12,
        boxShadow: active ? `0 8px 30px rgba(0,0,0,0.14)` : '0 2px 10px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}
    >
      <header
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          cursor: 'grab',
          background: active ? theme.accentSoft : theme.surface2,
          borderBottom: `1px solid ${theme.border}`,
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {frame.zone !== undefined && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 700,
              color: active ? theme.onAccent : theme.textMuted,
              background: active ? theme.accent : theme.border,
            }}
          >
            {frame.zone}
          </span>
        )}
        {/* The frame title IS the zone's heading now (the redundant in-body h1 was removed), so it
            carries the heading role - keeps the a11y landmark and the visual weight compact. */}
        <h2 style={{ fontSize: 13, fontWeight: 700, color: theme.text, margin: 0 }}>
          {frame.title}
        </h2>
        {locked && (
          <span
            title={lockedReason}
            style={{ marginLeft: 'auto', fontSize: 11, color: theme.textMuted }}
          >
            🔒 locked
          </span>
        )}
      </header>
      <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', position: 'relative' }}>
        {/* When the frame is an affordance gate, render the reason INSTEAD of the content, so a
            keyboard user cannot Tab into controls behind a visual overlay (the gate is real,
            not cosmetic). The content returns the moment the invariant is met. Rendered in normal
            flow (not an absolute overlay) so a content-sized frame still gets a height from it. */}
        {locked ? (
          <div
            role="note"
            style={{
              minHeight: 120,
              background: theme.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: 20,
              fontSize: 13,
              color: theme.textMuted,
            }}
          >
            {lockedReason}
          </div>
        ) : (
          children
        )}
      </div>
      {/* Bottom-right resize grip: drag to enlarge a frame (e.g. to see a whole process diagram).
          A small corner triangle, on top of the body, with a resize cursor. */}
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        title="Drag to resize"
        aria-label={`Resize ${frame.title}`}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 18,
          height: 18,
          cursor: 'nwse-resize',
          touchAction: 'none',
          background: `linear-gradient(135deg, transparent 50%, ${
            active ? theme.accent : theme.border
          } 50%)`,
          borderBottomRightRadius: 12,
        }}
      />
    </section>
  )
}
