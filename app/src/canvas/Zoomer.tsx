// v0.4 zoom controls (prototype procez-ui-v0.5 #zoomer): zoom in / out / fit, bottom-right.

import { theme } from '../theme.js'

interface ZoomerProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

const btn = {
  width: 34,
  height: 34,
  borderRadius: 9,
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  fontSize: 15,
  cursor: 'pointer',
  boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
  color: theme.text,
} as const

export function Zoomer({ onZoomIn, onZoomOut, onFit }: ZoomerProps) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 14,
        bottom: 16,
        display: 'flex',
        gap: 6,
        zIndex: 30,
      }}
    >
      <button type="button" onClick={onZoomIn} aria-label="Zoom in" style={btn}>
        ＋
      </button>
      <button type="button" onClick={onZoomOut} aria-label="Zoom out" style={btn}>
        －
      </button>
      <button type="button" onClick={onFit} aria-label="Fit the canvas" title="Fit" style={btn}>
        ▣
      </button>
    </div>
  )
}
