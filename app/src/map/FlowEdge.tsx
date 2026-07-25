// The deterministic hand-off connector for the Zone 2 (Map) surface.
//
// React Flow's stock edges anchor on DOM-MEASURED handle positions
// (getBoundingClientRect divided by React Flow's own viewport zoom). The one-canvas
// world renders every frame under a camera `scale()` transform, which leaks into
// those rects: a node measured while the camera sits at one zoom gets different
// handle offsets than a node measured at another, so connectors grew jogs and
// S-loops, and clicking a node (which re-measures just that node) visibly reshaped
// its edges. This edge sidesteps measurement entirely: node positions come from the
// deterministic layout (layout.ts, the truth React Flow is fed) and node sizes are
// the fixed per-type constants shapes.tsx renders at, so the path is a pure function
// of projected state - byte-stable across clicks, camera flights and zooms.

import { BaseEdge, Position, getSmoothStepPath, useInternalNode } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import { nodeDims } from './layout.js'

export function FlowEdge(props: EdgeProps): JSX.Element | null {
  const source = useInternalNode(props.source)
  const target = useInternalNode(props.target)
  if (source === undefined || target === undefined) return null

  const s = nodeDims(source.type)
  const t = nodeDims(target.type)
  const sp = source.internals.positionAbsolute
  const tp = target.internals.positionAbsolute

  // Anchors sit exactly where the shapes draw their handles: the vertical centre of
  // the right (source) / left (target) border.
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: sp.x + s.w,
    sourceY: sp.y + s.h / 2,
    sourcePosition: Position.Right,
    targetX: tp.x,
    targetY: tp.y + t.h / 2,
    targetPosition: Position.Left,
    borderRadius: 12,
  })

  // Conditional spreads: exactOptionalPropertyTypes forbids passing `undefined`
  // into BaseEdge's optional props explicitly.
  return (
    <BaseEdge
      path={path}
      labelX={labelX}
      labelY={labelY}
      {...(props.label !== undefined ? { label: props.label } : {})}
      {...(props.labelStyle !== undefined ? { labelStyle: props.labelStyle } : {})}
      {...(props.labelBgStyle !== undefined ? { labelBgStyle: props.labelBgStyle } : {})}
      {...(props.labelBgPadding !== undefined ? { labelBgPadding: props.labelBgPadding } : {})}
      {...(props.labelBgBorderRadius !== undefined
        ? { labelBgBorderRadius: props.labelBgBorderRadius }
        : {})}
      {...(props.style !== undefined ? { style: props.style } : {})}
      {...(props.markerEnd !== undefined ? { markerEnd: props.markerEnd } : {})}
      {...(props.interactionWidth !== undefined
        ? { interactionWidth: props.interactionWidth }
        : {})}
    />
  )
}
