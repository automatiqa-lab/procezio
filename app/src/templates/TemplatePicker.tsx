// v0.4 template picker (spec 01b section 13, H1): start from a common process instead of blank.
//
// Lists the shipped templates; choosing one starts a fresh session seeded with that Understand
// side (frame + map + data + friction), Diverge/Converge left empty. Presentation only - the
// actual seeding is ordinary content events dispatched by the caller (App.startFromTemplate).

import { theme } from '../theme.js'
import { ModalOverlay } from '../canvas/ModalOverlay.js'
import type { Template } from './template.js'
import { TEMPLATES } from './templates.generated.js'

interface TemplatePickerProps {
  open: boolean
  onPick: (template: Template) => void
  onClose: () => void
}

export function TemplatePicker({ open, onPick, onClose }: TemplatePickerProps) {
  if (!open) return null
  return (
    <ModalOverlay
      label="Start from a template"
      onClose={onClose}
      zIndex={60}
      width="min(560px, 94vw)"
      maxHeight="84vh"
      padding="22px 24px"
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.accent,
          marginBottom: 8,
        }}
      >
        Start from a template
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>
        A starting map for a common flow - the steps, handoffs, data profile and friction are
        seeded. The ideas, scores and case stay empty; those are always yours.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {TEMPLATES.map((tpl) => (
          <li key={tpl.id}>
            <button
              type="button"
              onClick={() => onPick(tpl)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                background: theme.surface2,
                padding: '13px 15px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{tpl.name}</div>
              <div
                style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 4, lineHeight: 1.5 }}
              >
                {tpl.description}
              </div>
              <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 6 }}>
                {tpl.nodes.length} steps · {tpl.friction.length} friction points · north-star:{' '}
                {tpl.frame.north_star}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </ModalOverlay>
  )
}
