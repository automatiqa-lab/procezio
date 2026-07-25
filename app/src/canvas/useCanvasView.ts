// v0.4 one-canvas view state: camera + frame positions, pan/zoom/fly (spec 01b section 2).
//
// Navigation is the camera. This hook owns the camera transform and per-frame position
// overrides (a frame the user dragged), starting from the DEFAULT_COMPOSITION. In Wave 1 the
// geometry lives in session React state here; the optional onFrameMoved callback is the SEAM
// for persisting it to the presentation stream (core/src/presentation.ts + the .pnav file) -
// that persistence lands in Phase 5, so today the callback is unset and reload resets layout.
// Either way geometry never enters the methodology projection: position is presentation.
//
// Heights come in two truths. Most frames render CONTENT-FIT (WidgetFrame sizes them to their
// body, not to frame.h), so the declared height diverges from the rendered one the moment
// content grows or shrinks. WidgetFrame reports its real rendered height here (reportHeight,
// world units), and the `frames` this hook hands out carry the EFFECTIVE height - measured when
// content-fitting, declared otherwise - so every consumer (resize grip seed, minimap, evidence
// line, camera centring, overlap arranging) sees what is actually on screen. The RESIZE path is
// unchanged: a grip-resized frame gets an explicit size, turns sized:true, and stops
// content-fitting, so its declared h is the truth again.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_CAMERA,
  DEFAULT_COMPOSITION,
  cameraToCentre,
  frameIdForZone,
  resolveFrameOverlaps,
  type Camera,
  type FrameBox,
  type FrameLayout,
} from './geometry.js'

export interface CanvasView {
  camera: Camera
  /** Frames with EFFECTIVE heights: measured render height for content-fit frames, declared h otherwise. */
  frames: FrameLayout[]
  /** Pan the camera by a screen-space delta (drag on empty canvas). */
  panBy: (dxScreen: number, dyScreen: number) => void
  /** Zoom around a screen point (wheel). */
  zoomAt: (factor: number, screenX: number, screenY: number) => void
  /** Fly the camera to centre a frame; used by the zone rail and the palette. */
  flyToFrame: (frameId: string, viewportW: number, viewportH: number) => void
  flyToZone: (zone: number, viewportW: number, viewportH: number) => void
  /** Move a frame to a new world position (drag on a frame header). */
  moveFrame: (frameId: string, x: number, y: number) => void
  /** Resize a frame to a new world size (drag on the bottom-right grip). */
  resizeFrame: (frameId: string, w: number, h: number) => void
  /**
   * Report a frame's actual rendered height (world units), from WidgetFrame's ResizeObserver.
   * Sub-half-unit changes are dropped (measurement noise, and the loop guard); a content-fit
   * frame that GROWS well past its declared box also debounces the same neighbour-pushing
   * arrange a manual resize runs, so grown content never silently paints over the next frame.
   */
  reportHeight: (frameId: string, h: number) => void
  /**
   * After `anchorId` changed size, nudge only the frames it now overlaps out of the way (keeping
   * the anchor, every non-overlapping frame, and every PRE-EXISTING overlap exactly where the
   * user put them). Heights come from the measured layer - no DOM reads needed by the caller.
   */
  autoArrange: (anchorId: string) => void
  /** Zoom in/out keeping the viewport centre fixed (the zoomer buttons). */
  zoomStep: (factor: number, viewportW: number, viewportH: number) => void
  /** Reset to the default camera (fit). */
  resetCamera: () => void
  /** Centre the camera on a world point (used by the minimap). */
  centerOn: (worldX: number, worldY: number, viewportW: number, viewportH: number) => void
}

const clampZoom = (z: number): number => Math.min(2, Math.max(0.3, z))

/** The smallest a frame can be dragged to, so it never collapses to an unusable sliver. */
const MIN_FRAME_W = 240
const MIN_FRAME_H = 160

/** The gutter (world units) left between frames when the resize resolver pushes them apart. */
const ARRANGE_GAP = 28

/** Measurement noise floor: a reported height must move more than this to count as a change. */
const HEIGHT_EPSILON = 0.5

/** Content may spill this far past the declared box before neighbours get re-arranged. */
const GROWTH_SLACK = 8

/** Content grows in bursts (typing, list adds); debounce so one arrange covers the burst. */
const GROWTH_DEBOUNCE_MS = 150

const DEFAULTS: ReadonlyMap<string, FrameLayout> = new Map(
  DEFAULT_COMPOSITION.map((f) => [f.id, f]),
)

/**
 * The height a frame actually occupies on canvas: an explicit user size wins outright, the map
 * always renders at its declared height (it embeds a React Flow viewport), and everything else
 * content-fits - so the measured render height is the truth, with declared h as the pre-first-
 * measurement fallback. Mirrors WidgetFrame's fitContent condition exactly.
 */
const effectiveHeight = (
  f: FrameLayout,
  size: { w: number; h: number } | undefined,
  measured: Record<string, number>,
): number => (size !== undefined ? size.h : f.zone === 2 ? f.h : (measured[f.id] ?? f.h))

export function useCanvasView(
  onFrameMoved?: (frameId: string, x: number, y: number) => void,
): CanvasView {
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA)
  // Position overrides keyed by frame id; absent = default composition position.
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({})
  // Size overrides keyed by frame id; absent = content-fit (or the default h for the map).
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  // Measured rendered heights (world units) per frame - the content-fit truth WidgetFrame reports.
  const [measured, setMeasured] = useState<Record<string, number>>({})
  // Event-path mirrors of the three geometry states: pointer/observer callbacks read and write
  // these eagerly (then mirror into state for render), so a burst of calls landing between two
  // renders never works from a stale snapshot.
  const overridesRef = useRef<Record<string, { x: number; y: number }>>({})
  const sizesRef = useRef<Record<string, { w: number; h: number }>>({})
  const measuredRef = useRef<Record<string, number>>({})
  // The anchor's box BEFORE a resize drag / growth burst, per frame id: the overlap resolver uses
  // it to leave pre-existing overlaps alone. Written on the first grip move (or the first growth
  // report of a burst), consumed and cleared by the arrange that follows.
  const beforeBox = useRef<Record<string, FrameBox>>({})
  // Growth bookkeeping: one debounce timer per frame, and the height each frame last scheduled an
  // arrange at. Arranges move frames but never change heights, so re-reports of an unchanged
  // height must never re-arrange - this is the defensive loop guard.
  const growthTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const lastArrangedH = useRef<Record<string, number>>({})
  const onMovedRef = useRef(onFrameMoved)
  useEffect(() => {
    onMovedRef.current = onFrameMoved
  }, [onFrameMoved])

  // The timer record object is stable for the hook's whole life (only its entries change), so
  // capturing it at mount and clearing whatever it holds at unmount is exact, not a race.
  useEffect(() => {
    const timers = growthTimers.current
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t)
    }
  }, [])

  const frames = useMemo<FrameLayout[]>(
    () =>
      DEFAULT_COMPOSITION.map((f) => {
        const o = overrides[f.id]
        const s = sizes[f.id]
        return {
          ...f,
          ...(o ? { x: o.x, y: o.y } : {}),
          // A user-set size pins the frame to explicit w/h (and marks it sized, so WidgetFrame
          // stops content-fitting and honours the height the user dragged to).
          ...(s ? { w: s.w, sized: true } : {}),
          // Every read path gets the height that is actually on screen, so the grip seed, the
          // minimap, the evidence line and camera centring never diverge from the render.
          h: effectiveHeight(f, s, measured),
        }
      }),
    [overrides, sizes, measured],
  )

  const panBy = useCallback((dxScreen: number, dyScreen: number) => {
    setCamera((c) => ({ ...c, x: c.x - dxScreen / c.zoom, y: c.y - dyScreen / c.zoom }))
  }, [])

  const zoomAt = useCallback((factor: number, screenX: number, screenY: number) => {
    setCamera((c) => {
      const zoom = clampZoom(c.zoom * factor)
      // Keep the world point under the cursor fixed while zooming.
      const worldX = c.x + screenX / c.zoom
      const worldY = c.y + screenY / c.zoom
      return { zoom, x: worldX - screenX / zoom, y: worldY - screenY / zoom }
    })
  }, [])

  const flyToFrame = useCallback(
    (frameId: string, viewportW: number, viewportH: number) => {
      const frame = frames.find((f) => f.id === frameId)
      if (frame) setCamera(cameraToCentre(frame, viewportW, viewportH))
    },
    [frames],
  )

  const flyToZone = useCallback(
    (zone: number, viewportW: number, viewportH: number) =>
      flyToFrame(frameIdForZone(zone), viewportW, viewportH),
    [flyToFrame],
  )

  const moveFrame = useCallback((frameId: string, x: number, y: number) => {
    overridesRef.current = { ...overridesRef.current, [frameId]: { x, y } }
    setOverrides(overridesRef.current)
    // A deliberate move redefines where the frame "was": any pre-resize snapshot taken at the old
    // position no longer describes reality, so drop it rather than feed the resolver a stale box.
    delete beforeBox.current[frameId]
    onMovedRef.current?.(frameId, x, y)
  }, [])

  // First touch of a resize drag or growth burst: remember the frame's CURRENT box so the arrange
  // can tell which overlaps predate the change (and are therefore none of its business).
  const snapshotBefore = useCallback((frameId: string): void => {
    if (beforeBox.current[frameId] !== undefined) return
    const def = DEFAULTS.get(frameId)
    if (def === undefined) return
    const o = overridesRef.current[frameId]
    const s = sizesRef.current[frameId]
    beforeBox.current[frameId] = {
      id: frameId,
      x: o?.x ?? def.x,
      y: o?.y ?? def.y,
      w: s?.w ?? def.w,
      h: effectiveHeight(def, s, measuredRef.current),
    }
  }, [])

  const resizeFrame = useCallback(
    (frameId: string, w: number, h: number) => {
      snapshotBefore(frameId)
      // A manual resize supersedes any growth arrange still pending for this frame.
      const t = growthTimers.current[frameId]
      if (t !== undefined) {
        clearTimeout(t)
        delete growthTimers.current[frameId]
      }
      sizesRef.current = {
        ...sizesRef.current,
        [frameId]: { w: Math.max(MIN_FRAME_W, w), h: Math.max(MIN_FRAME_H, h) },
      }
      setSizes(sizesRef.current)
    },
    [snapshotBefore],
  )

  const autoArrange = useCallback((anchorId: string) => {
    // Build each frame's CURRENT world box (live position + width + effective height) from the
    // event-path mirrors, then push only the frames the anchor's new size ran into out of the
    // way. Non-overlapping frames and pre-existing overlaps keep their exact position, so the
    // user's arrangement survives a resize.
    const boxes: FrameBox[] = DEFAULT_COMPOSITION.map((f) => {
      const o = overridesRef.current[f.id]
      const s = sizesRef.current[f.id]
      return {
        id: f.id,
        x: o?.x ?? f.x,
        y: o?.y ?? f.y,
        w: s?.w ?? f.w,
        h: effectiveHeight(f, s, measuredRef.current),
      }
    })
    const before = beforeBox.current[anchorId]
    delete beforeBox.current[anchorId]
    const next = resolveFrameOverlaps(boxes, anchorId, ARRANGE_GAP, before)
    overridesRef.current = next
    setOverrides(next)
  }, [])

  const reportHeight = useCallback(
    (frameId: string, h: number) => {
      const def = DEFAULTS.get(frameId)
      if (def === undefined) return
      const prev = measuredRef.current[frameId]
      // Unchanged (within noise) = no state write at all: the ResizeObserver -> report -> render
      // path can never loop, because a render that changes nothing re-reports nothing.
      if (prev !== undefined && Math.abs(prev - h) <= HEIGHT_EPSILON) return
      const s = sizesRef.current[frameId]
      const fits = def.zone !== 2 && s === undefined // mirrors WidgetFrame's content-fit condition
      // Occlusion guard: content that grew past the declared box paints over the next frame in
      // DOM order, and nothing else would reflow (autoArrange otherwise only runs on grip
      // release). Arrange when the spill exceeds the slack AND the height actually moved since
      // the last scheduled arrange for this frame.
      const spills = fits && h > def.h + GROWTH_SLACK
      const last = lastArrangedH.current[frameId]
      const grewSinceArrange = last === undefined || Math.abs(last - h) > HEIGHT_EPSILON
      // Snapshot BEFORE the mirror learns the new height - the resolver needs the pre-growth box.
      if (spills && grewSinceArrange) snapshotBefore(frameId)
      measuredRef.current = { ...measuredRef.current, [frameId]: h }
      setMeasured(measuredRef.current)
      if (!(spills && grewSinceArrange)) return
      lastArrangedH.current[frameId] = h
      const t = growthTimers.current[frameId]
      if (t !== undefined) clearTimeout(t)
      growthTimers.current[frameId] = setTimeout(() => {
        delete growthTimers.current[frameId]
        autoArrange(frameId)
      }, GROWTH_DEBOUNCE_MS)
    },
    [autoArrange, snapshotBefore],
  )

  const zoomStep = useCallback((factor: number, vw: number, vh: number) => {
    setCamera((c) => {
      const zoom = clampZoom(c.zoom * factor)
      const cx = c.x + vw / 2 / c.zoom
      const cy = c.y + vh / 2 / c.zoom
      return { zoom, x: cx - vw / 2 / zoom, y: cy - vh / 2 / zoom }
    })
  }, [])

  const resetCamera = useCallback(() => setCamera(DEFAULT_CAMERA), [])

  const centerOn = useCallback((worldX: number, worldY: number, vw: number, vh: number) => {
    setCamera((c) => ({ ...c, x: worldX - vw / 2 / c.zoom, y: worldY - vh / 2 / c.zoom }))
  }, [])

  return {
    camera,
    frames,
    panBy,
    zoomAt,
    flyToFrame,
    flyToZone,
    moveFrame,
    resizeFrame,
    reportHeight,
    autoArrange,
    zoomStep,
    resetCamera,
    centerOn,
  }
}
