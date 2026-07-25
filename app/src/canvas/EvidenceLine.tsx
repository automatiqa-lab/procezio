// v0.4 the evidence line (spec 01b section 5, decision B8): a dashed pencil connector from a
// live Challenger interjection back to the canvas element it stands on.
//
// When the Challenger issues a challenge, its point MUST cite ≥1 canvas element id (enforced in
// the challenger task). This overlay draws the visible consequence: a curved dashed line from
// the Prioritize frame - where the challenged score lives - to the frame that holds the first
// cited element (the map for a step, data & rules for a data tag, friction for a friction note).
// It rides the world transform (it is a child of the world layer), so it pans and zooms with the
// canvas. Presentation only: it reads geometry + one payload and draws; it dispatches nothing.

import type { ChallengeIssuedPayload, Canvas } from '@procezio/schema'
import type { FrameLayout } from './geometry.js'
import { theme } from '../theme.js'

interface EvidenceLineProps {
  frames: readonly FrameLayout[]
  canvas: Canvas
  challenge: ChallengeIssuedPayload | null
}

/** Which frame holds a cited element id: a step -> map, a data tag -> data, a friction -> friction. */
function frameIdForRef(canvas: Canvas, id: string): string {
  if (canvas.nodes.some((n) => n.id === id)) return 'zone-2'
  if ((canvas.audit_tags ?? []).some((a) => a.id === id)) return 'zone-4'
  if ((canvas.friction ?? []).some((f) => f.id === id)) return 'zone-3'
  return 'zone-2'
}

export function EvidenceLine({ frames, canvas, challenge }: EvidenceLineProps) {
  if (challenge === null) return null
  const source = frames.find((f) => f.id === 'zone-6')
  const targetId = frameIdForRef(canvas, challenge.cited_refs[0])
  const target = frames.find((f) => f.id === targetId)
  if (!source || !target) return null

  // Anchor at the Prioritize frame's top edge, curving to the cited frame's bottom edge.
  const sx = source.x + source.w / 2
  const sy = source.y
  const tx = target.x + target.w * 0.5
  const ty = target.y + target.h
  // Two control points bow the curve out to the side, so it reads as a deliberate connector.
  const c1x = sx + (tx - sx) * 0.1
  const c1y = sy - Math.max(80, (sy - ty) * 0.45)
  const c2x = tx - (tx - sx) * 0.1
  const c2y = ty + Math.max(80, (sy - ty) * 0.45)
  const midx = (sx + tx) / 2
  const midy = (sy + ty) / 2

  return (
    <svg
      aria-hidden="true"
      width={1}
      height={1}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <path
        d={`M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`}
        fill="none"
        stroke={theme.pencil}
        strokeWidth={1.8}
        strokeDasharray="6 5"
      />
      <circle cx={tx} cy={ty} r={4} fill={theme.pencil} />
      <text
        x={midx}
        y={midy}
        fill={theme.pencil}
        style={{ font: `600 12px ${theme.mono}` }}
        textAnchor="middle"
      >
        evidence →
      </text>
    </svg>
  )
}
