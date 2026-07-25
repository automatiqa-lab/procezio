// v0.4 - the presentation-stream projection (spec 01b section 2/3, decision KRH5w5KrRemQ).
//
// The second stream. Geometry - node positions and frame position/size/collapsed - lives
// apart from the methodology so it can never change replayed state: "position is
// presentation, connections are semantics". This fold turns the presentation log into a
// last-write-wins PresentationState, a DISPOSABLE view. Losing it loses no methodology truth;
// the one geometry act with meaning, a lane crossing, is a CONTENT event (step.reassigned)
// and is folded by project(), not here.
//
// Pure + isomorphic: a function of the presentation log alone. No clock, no RNG, no cross-talk
// with the Canvas or provenance projections. Events are folded in log (seq) order, exactly as
// project() folds the content log, so the store's monotonic seq is the ordering authority.

import type {
  PresentationEnvelope,
  PresentationState,
  NodeMovedPayload,
  FrameMovedPayload,
  FrameResizedPayload,
  FrameCollapsedPayload,
  Position,
  Size,
} from '@procezio/schema'

/** Accumulated geometry for one frame while folding (frame_id is the map key). */
interface FrameGeometry {
  position?: Position
  size?: Size
  collapsed?: boolean
}

/**
 * Fold the presentation stream into last-write-wins geometry. Later events for the same
 * node/frame overwrite earlier ones; a frame absent from the result sits in the default A3
 * composition. Deterministic and side-effect-free.
 */
export function projectPresentation(events: readonly PresentationEnvelope[]): PresentationState {
  const nodes = new Map<string, Position>()
  const frames = new Map<string, FrameGeometry>()

  const frameFor = (id: string): FrameGeometry => {
    const existing = frames.get(id)
    if (existing) return existing
    const fresh: FrameGeometry = {}
    frames.set(id, fresh)
    return fresh
  }

  for (const event of events) {
    switch (event.type) {
      case 'node.moved': {
        const p = event.payload as NodeMovedPayload
        nodes.set(p.node_id, p.position)
        break
      }
      case 'frame.moved': {
        const p = event.payload as FrameMovedPayload
        frameFor(p.frame_id).position = p.position
        break
      }
      case 'frame.resized': {
        const p = event.payload as FrameResizedPayload
        frameFor(p.frame_id).size = p.size
        break
      }
      case 'frame.collapsed': {
        const p = event.payload as FrameCollapsedPayload
        frameFor(p.frame_id).collapsed = p.collapsed
        break
      }
      // No default effect: an unknown presentation type is a no-op, never a throw, so an
      // older build folding a newer stream degrades gracefully (same posture as project()).
    }
  }

  return {
    nodes: [...nodes].map(([node_id, position]) => ({ node_id, position })),
    frames: [...frames].map(([frame_id, geometry]) => ({ frame_id, ...geometry })),
  }
}
