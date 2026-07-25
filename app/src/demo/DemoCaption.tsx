// v0.4 demo caption bar (spec 01b section 13, N2). While the keyless demo plays, a caption at the
// foot of the canvas narrates each beat, with a Stop control. Presentation only.

import { theme } from '../theme.js'

interface DemoCaptionProps {
  caption: string | null
  onStop: () => void
}

export function DemoCaption({ caption, onStop }: DemoCaptionProps) {
  if (caption === null) return null
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 45,
        width: 'min(640px, 94vw)',
        background: 'rgba(28,25,20,0.92)',
        color: '#FBF7EF',
        borderRadius: 12,
        boxShadow: '0 14px 40px rgba(0,0,0,0.3)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: theme.pencil }}>
        DEMO
      </span>
      <span style={{ flex: '1 1 auto' }}>{caption}</span>
      <button
        type="button"
        onClick={onStop}
        style={{
          flex: '0 0 auto',
          border: '1px solid rgba(251,247,239,0.4)',
          background: 'transparent',
          color: '#FBF7EF',
          borderRadius: 8,
          padding: '4px 12px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Stop
      </button>
    </div>
  )
}
