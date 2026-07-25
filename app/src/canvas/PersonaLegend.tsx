// v0.4 persona legend (spec 01b section 6, prototype #plegend). The neutral system trio that
// the agent speaks as - Facilitator (pace), Process Auditor (verify, owns the ledger), The
// Challenger (attack, post-commit only). Declarative masks over one orchestrator, never runtime
// multi-agent. Shown here so the sparring bench is legible even before a model is connected;
// the persona prompt packs that drive real messages are the LLM task-layer work (fast-follow).

import { theme } from '../theme.js'

const TRIO: { key: string; label: string; badge: string; color: string; role: string }[] = [
  { key: 'facilitator', label: 'Facilitator', badge: 'F', color: theme.text, role: 'pace & route' },
  {
    key: 'auditor',
    label: 'Process Auditor',
    badge: 'A',
    color: theme.accent,
    role: 'verify · owns the ledger',
  },
  {
    key: 'challenger',
    label: 'The Challenger',
    badge: 'C',
    color: theme.friction,
    role: 'attack · post-commit only',
  },
]

export function PersonaLegend() {
  return (
    <div style={{ padding: '10px 13px 8px' }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.9,
          textTransform: 'uppercase',
          color: theme.textMuted,
          marginBottom: 8,
        }}
      >
        Sparring bench · pencil until you accept
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TRIO.map((p) => (
          <span
            key={p.key}
            title={p.role}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              border: `1px solid ${theme.border}`,
              borderRadius: 14,
              padding: '3px 9px',
              background: '#fff',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 15,
                height: 15,
                borderRadius: 4,
                background: p.color,
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {p.badge}
            </span>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}
