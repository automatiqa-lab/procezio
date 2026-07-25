// M2-03 - the five visually-distinct React Flow node types plus the swimlane band.
//
// These are VIEW-ONLY components. They render what the projection already decided;
// they never mutate state. Each of the five ontology shapes (Start/Step/Decision/
// Wait/End, spec v0.2 section 7) is drawn with a distinct silhouette and colour so
// the map reads at a glance. Every shape carries a source and target Handle so an
// edge can be drawn between any two nodes (React Flow's onConnect turns that into
// an edge.created event upstream). Styling is inline (no CSS framework, no new
// dependency); the theme's palette is reused where it fits.

import { memo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { NodeMetadata, NodeType } from '@procezio/schema'
import { theme } from '../theme.js'
import { DECISION_SIDE, NODE_HEIGHT, NODE_WIDTH } from './layout.js'

/** The data a shape node renders from. Kept structurally compatible with React
 * Flow's Record<string, unknown> node data; read back via a cast in the component. */
export interface ShapeNodeData {
  label: string
  nodeType: NodeType
  metadata?: NodeMetadata
  /** True while this node is an unaccepted agent draft (two-ink pencil, M2-16). */
  pencil?: boolean
  /**
   * Delete this node (targeted C10 compensation upstream). When present, the shape
   * grows a ✕ in its top-right corner on hover (and while selected, so the affordance
   * is reachable without precise hovering). Absent in the read-only to-be view and
   * before a session exists.
   */
  onDelete?: (nodeId: string) => void
}

/** Per-shape palette. Distinct hue AND silhouette per type, so the five are never
 * confused: Start green pill, Step parchment rectangle, Decision gold diamond,
 * Wait blue rounded, End dark pill. */
const PALETTE: Record<NodeType, { bg: string; border: string; fg: string }> = {
  Start: { bg: theme.accent, border: '#245f46', fg: '#ffffff' },
  Step: { bg: theme.surface, border: '#c9c1ad', fg: theme.text },
  Decision: { bg: '#f6e7c1', border: '#d9b968', fg: '#3a2f12' },
  Wait: { bg: '#e6eef7', border: '#9db7d4', fg: '#23405e' },
  End: { bg: '#3a3a3a', border: '#242424', fg: '#ffffff' },
}

const HANDLE_STYLE = { width: 9, height: 9, background: theme.accent, border: '2px solid #ffffff' }

/** Source + target handles common to every shape, so any pair can be connected. */
function ShapeHandles(): JSX.Element {
  return (
    <>
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </>
  )
}

/**
 * The non-color half of the two-ink cue on a Map node: a visible pencil glyph with an
 * accessible label, so "this is an agent draft" survives when the amber + dashed border
 * can't be perceived (colour-blindness, high-contrast modes, screen readers).
 */
function PencilMark(): JSX.Element {
  return (
    <span
      role="img"
      aria-label="agent draft, pending your review"
      title="Agent draft - pending your review"
      style={{
        flex: '0 0 auto',
        fontSize: 12,
        fontWeight: 700,
        color: theme.pencil,
        lineHeight: 1,
      }}
    >
      &#9998;
    </span>
  )
}

/**
 * The hover/selected ✕ that deletes a mistakenly-placed shape (Aleks's 2026-07-24
 * request: an in-place corner affordance, not a panel button). Sits just outside the
 * shape's top-right corner; pointer events are stopped so pressing it never doubles
 * as a node-select click.
 */
function DeleteCorner({
  visible,
  onPress,
  label,
}: {
  visible: boolean
  onPress: () => void
  label: string
}): JSX.Element {
  // The button is a real tab stop even while visually hidden, so keyboard focus must
  // reveal it - an invisible focused destructive control would fail WCAG focus-visible.
  const [focused, setFocused] = useState(false)
  const shown = visible || focused
  return (
    <button
      type="button"
      aria-label={`Delete ${label}`}
      title="Delete (Redo restores it)"
      onClick={(e) => {
        e.stopPropagation()
        onPress()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: 'absolute',
        top: -9,
        right: -9,
        width: 20,
        height: 20,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: theme.surface,
        color: theme.textMuted,
        fontSize: 12,
        lineHeight: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        // Hidden-but-focusable when not hovered/selected: opacity keeps it reachable
        // by keyboard (Tab reveals it via the focused state above).
        opacity: shown ? 1 : 0,
        pointerEvents: shown ? 'auto' : 'none',
        transition: 'opacity 120ms',
        zIndex: 2,
      }}
    >
      ✕
    </button>
  )
}

/**
 * One component drives all five shape types (React Flow maps each type string to
 * it via nodeTypes below). It switches on the node's type to pick the silhouette,
 * so the five are rendered distinctly from a single, DRY implementation.
 */
export function ShapeNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as ShapeNodeData
  const type = (props.type as NodeType) ?? data.nodeType
  const colors = PALETTE[type] ?? PALETTE.Step
  const selected = props.selected === true
  // Hover state for the delete corner - view-local, never canvas state.
  const [hovered, setHovered] = useState(false)
  const deleteCorner: ReactNode = data.onDelete ? (
    <DeleteCorner
      visible={hovered || selected}
      onPress={() => data.onDelete?.(props.id)}
      label={data.label}
    />
  ) : null
  const hoverProps = data.onDelete
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {}
  // A pencil (agent-draft) node reads amber + dashed until the human accepts it; a
  // selected node keeps the accent outline. Provenance styling is a pure function of
  // the provenance state (constitution p5).
  const pencil = data.pencil === true

  const outline = pencil
    ? `2px dashed ${theme.pencil}`
    : selected
      ? `2px solid ${theme.accent}`
      : `1.5px solid ${colors.border}`
  const shadow = selected ? `0 0 0 3px ${theme.accentSoft}` : '0 1px 2px rgba(0,0,0,0.12)'
  const labelStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: colors.fg,
    textAlign: 'center',
    lineHeight: 1.2,
    padding: '0 6px',
    wordBreak: 'break-word',
  }

  // Decision is a rotated square (diamond); the label is counter-rotated so it
  // stays upright. Handles sit on the diamond's left/right points.
  if (type === 'Decision') {
    const side = DECISION_SIDE
    return (
      <div style={{ position: 'relative', width: side, height: side }} {...hoverProps}>
        {deleteCorner}
        <div
          style={{
            width: side,
            height: side,
            transform: 'rotate(45deg)',
            background: colors.bg,
            border: outline,
            boxShadow: shadow,
            borderRadius: 8,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {pencil ? <PencilMark /> : null}
          <span style={labelStyle}>{data.label}</span>
        </div>
        <ShapeHandles />
      </div>
    )
  }

  // Start / End are pills (fully rounded); Step is a soft rectangle; Wait is a
  // rounded rectangle with a leading marker so it reads as a pause/queue.
  const isPill = type === 'Start' || type === 'End'
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        boxSizing: 'border-box',
        background: colors.bg,
        border: outline,
        boxShadow: shadow,
        borderRadius: isPill ? NODE_HEIGHT / 2 : 10,
      }}
      {...hoverProps}
    >
      {deleteCorner}
      {pencil ? <PencilMark /> : null}
      {type === 'Wait' ? (
        <span aria-hidden="true" style={{ fontSize: 14 }}>
          &#9203;
        </span>
      ) : null}
      <span style={labelStyle}>{data.label}</span>
      <ShapeHandles />
    </div>
  )
}

/** The data a swimlane band renders from. */
export interface LaneNodeData {
  actor: string
}

/**
 * A swimlane band: a wide, non-interactive rectangle drawn behind the shapes with
 * the actor's name down the left edge. pointer-events are disabled so clicks fall
 * through to the shapes on top.
 */
export function LaneNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as LaneNodeData
  const evenRow = (Number(props.id.replace(/\D/g, '')) || 0) % 2 === 0
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        background: evenRow ? 'rgba(46,125,91,0.05)' : 'rgba(46,125,91,0.02)',
        borderTop: `1px solid ${theme.border}`,
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 170,
          padding: '0 14px',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          color: theme.textMuted,
          borderRight: `1px dashed ${theme.border}`,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {data.actor}
      </div>
    </div>
  )
}

/**
 * The React Flow nodeTypes registry: each of the five ontology shapes maps to the
 * shared ShapeNode (rendered distinctly by type), and the swimlane band maps to
 * LaneNode. A stable module-level constant so React Flow does not warn about a
 * changing nodeTypes object across renders. The components are memo-wrapped: MapZone
 * keeps unselected nodes' object identity stable across selection changes, so with
 * memo a click re-renders two shapes (old + new selection), not the whole map.
 */
const MemoShapeNode = memo(ShapeNode)
const MemoLaneNode = memo(LaneNode)

export const nodeTypes = {
  Start: MemoShapeNode,
  Step: MemoShapeNode,
  Decision: MemoShapeNode,
  Wait: MemoShapeNode,
  End: MemoShapeNode,
  lane: MemoLaneNode,
} as const
