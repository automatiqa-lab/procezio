// v0.4 one-canvas geometry: the default A3 composition of methodology widget frames.
//
// The eight zones plus the Shoebox live as movable frames on a single infinite surface (spec
// 01b section 2). This file is the DEFAULT composition - where each frame sits before the user
// drags it. Positions are world coordinates; the camera (useCanvasView) maps world -> screen.
// A user-moved frame overrides its default via the presentation stream; frames never in the
// stream fall back to here.

export interface FrameLayout {
  /** Frame id: `zone-1`..`zone-8` for the methodology zones, `shoebox` for the notes widget. */
  id: string
  /** Zone number 1-8, or undefined for the Shoebox (which is beside the method, not a zone). */
  zone?: number
  title: string
  x: number
  y: number
  w: number
  h: number
  /** True once the user has dragged the resize grip: the frame uses w/h verbatim, not content-fit. */
  sized?: boolean
}

// Laid out in reading order: Understand across the top (Frame, Map, Friction, Data), Diverge
// and Converge below, Shoebox to the left "beside the sheet". Rough by design - the point is a
// sensible starting arrangement the user rearranges freely.
export const DEFAULT_COMPOSITION: readonly FrameLayout[] = [
  { id: 'shoebox', title: 'Shoebox', x: -340, y: 0, w: 300, h: 380 },
  { id: 'zone-1', zone: 1, title: 'Frame', x: 0, y: 0, w: 380, h: 340 },
  { id: 'zone-2', zone: 2, title: 'Process map', x: 420, y: 0, w: 760, h: 440 },
  { id: 'zone-3', zone: 3, title: 'Friction', x: 1220, y: 0, w: 360, h: 340 },
  { id: 'zone-4', zone: 4, title: 'Data & rules', x: 0, y: 380, w: 380, h: 320 },
  { id: 'zone-5', zone: 5, title: 'Ideation', x: 420, y: 480, w: 360, h: 320 },
  { id: 'zone-6', zone: 6, title: 'Prioritize', x: 820, y: 480, w: 360, h: 360 },
  { id: 'zone-7', zone: 7, title: 'Risk gate', x: 1220, y: 380, w: 360, h: 320 },
  { id: 'zone-8', zone: 8, title: 'Improvement case', x: 1220, y: 740, w: 420, h: 380 },
] as const

export const frameIdForZone = (zone: number): string => `zone-${zone}`

/** A frame's world rectangle, for overlap resolution. */
export interface FrameBox {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Positive-area rectangle intersection - shared by the resolver's pre-set and its sweeps. */
const rectsOverlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0

/** Canonical unordered pair key, so (a,b) and (b,a) name the same pre-existing overlap. */
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * After `anchorId` is resized, push only the frames in ITS collision chain out of the way, each
 * along its shorter overlap axis and away from whatever pushed it (a wider frame shoves its right
 * neighbour right; a taller one shoves the frame below it down), leaving a `gap` gutter. The push
 * floods outward from the anchor: a frame that gets shoved can shove the next one, but a frame the
 * chain never reaches is left EXACTLY where the user put it - so resizing one module nudges its
 * neighbours aside without re-packing the board or disturbing distant, pre-existing arrangements
 * (including any overlaps that were already there and are none of this resize's business).
 *
 * `anchorBefore` is the anchor's rectangle BEFORE the resize. Only the anchor changed size, so a
 * non-anchor pair that overlaps in the input already overlapped before; a pair involving the
 * anchor pre-existed exactly when the other frame overlapped `anchorBefore`. Those pairs are the
 * user's deliberate arrangement and the push loop skips them. Omitting `anchorBefore` treats
 * every anchor overlap as caused by this resize - the safe default when no snapshot exists.
 *
 * Pure and deterministic: the anchor never moves, frames are visited in array order, propagation is
 * bounded by MAX_ROUNDS, and the same input always yields the same positions - unit-tested, no DOM.
 */
export function resolveFrameOverlaps(
  boxes: readonly FrameBox[],
  anchorId: string,
  gap = 24,
  anchorBefore?: { x: number; y: number; w: number; h: number },
): Record<string, { x: number; y: number }> {
  const pos = boxes.map((b) => ({ ...b }))
  const anchor = pos.find((b) => b.id === anchorId)

  // Pre-existing overlaps, per the contract above: skip exactly these pairs when pushing.
  const pre = new Set<string>()
  for (const a of pos) {
    for (const b of pos) {
      if (a.id >= b.id) continue // each unordered pair once
      if (a.id === anchorId || b.id === anchorId) {
        const other = a.id === anchorId ? b : a
        if (anchorBefore !== undefined && rectsOverlap(anchorBefore, other))
          pre.add(pairKey(a.id, b.id))
      } else if (rectsOverlap(a, b)) {
        pre.add(pairKey(a.id, b.id))
      }
    }
  }

  const MAX_ROUNDS = 400
  // Frontier flood: frames that can push others this round. A frame joins once it has itself been
  // shoved, so displacement propagates strictly outward from the seed.
  const flood = (seed: readonly string[]): void => {
    let frontier = [...seed]
    let rounds = 0
    while (frontier.length > 0 && rounds < MAX_ROUNDS) {
      rounds += 1
      const next: string[] = []
      for (const pusherId of frontier) {
        const p = pos.find((b) => b.id === pusherId)
        if (!p) continue
        for (const o of pos) {
          if (o.id === pusherId || o.id === anchorId) continue // never move the anchor
          if (pre.has(pairKey(pusherId, o.id))) continue // pre-existing arrangement: hands off
          const penX = Math.min(p.x + p.w, o.x + o.w) - Math.max(p.x, o.x)
          const penY = Math.min(p.y + p.h, o.y + o.h) - Math.max(p.y, o.y)
          if (penX <= 0 || penY <= 0) continue // not actually overlapping
          // The resize grip grows a frame right + down from its fixed top-left, so a displaced
          // frame only ever needs to move RIGHT or DOWN to clear it - never left or up (which
          // would drift a frame backwards past its neighbours or into the toolbar). We use true
          // EXIT distances (correct even when o is wholly inside p) and take the smaller of the
          // two. Because moves are strictly positive, the flood is monotonic and always converges
          // - no oscillation.
          const right = p.x + p.w - o.x // move o right until its left meets p's right
          const down = p.y + p.h - o.y // move o down until its top meets p's bottom
          if (right <= down) o.x += right + gap
          else o.y += down + gap
          next.push(o.id) // o has moved, so it may now shove its own neighbours
        }
      }
      frontier = next
    }
  }

  flood([anchorId])

  // A chained push can land a frame back INSIDE the anchor: the anchor seeds the frontier once
  // and is never re-checked as an obstacle for frames other frames displaced. Sweep after the
  // flood: any intruder still on the anchor - that was not deliberately there before - gets its
  // own push (right/down by exit distance, same rules) and its own flood, until the anchor is
  // clear. Pushes are strictly positive so this converges; the bound is a defensive guarantee of
  // termination, not an expected path.
  if (anchor !== undefined) {
    for (let sweep = 0; sweep < 20; sweep += 1) {
      const intruder = pos.find(
        (o) => o.id !== anchorId && !pre.has(pairKey(anchorId, o.id)) && rectsOverlap(anchor, o),
      )
      if (intruder === undefined) break
      const right = anchor.x + anchor.w - intruder.x
      const down = anchor.y + anchor.h - intruder.y
      if (right <= down) intruder.x += right + gap
      else intruder.y += down + gap
      flood([intruder.id])
    }
  }

  const out: Record<string, { x: number; y: number }> = {}
  for (const b of pos) out[b.id] = { x: b.x, y: b.y }
  return out
}

/** Camera transform: world point (x,y) maps to screen ((x-camX)*zoom, (y-camY)*zoom). */
export interface Camera {
  x: number
  y: number
  zoom: number
}

export const DEFAULT_CAMERA: Camera = { x: -80, y: -60, zoom: 0.72 }

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Compute the camera that centres a frame in a viewport of the given screen size. */
export function cameraToCentre(
  frame: FrameLayout,
  viewportW: number,
  viewportH: number,
  zoom = 0.9,
): Camera {
  const cx = frame.x + frame.w / 2
  const cy = frame.y + frame.h / 2
  return {
    x: cx - viewportW / 2 / zoom,
    y: cy - viewportH / 2 / zoom,
    zoom: clamp(zoom, 0.3, 2),
  }
}
