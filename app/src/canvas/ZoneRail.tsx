// v0.4 zone rail: navigation as camera flight, completeness as named missing items.
//
// The rail lists the eight zones grouped by phase. Each row shows how many named items are
// still missing in that zone (spec 01b section 2, A2 - never a percentage); clicking flies the
// camera to that frame. A Shoebox entry sits apart, beside the method. This is pure navigation
// - it dispatches nothing.

import { zoneCompleteness } from '@procezio/core'
import type { Canvas } from '@procezio/schema'
import { PHASES } from '../zones.js'
import { theme } from '../theme.js'
import { useT } from '../i18n/i18n.js'

interface ZoneRailProps {
  canvas: Canvas
  activeZone: number
  onSelectZone: (zone: number) => void
  onSelectShoebox: () => void
  /** Guided mode shows the off-ramp signpost; Express hides the helper copy. */
  verbose?: boolean
}

export function ZoneRail({
  canvas,
  activeZone,
  onSelectZone,
  onSelectShoebox,
  verbose = true,
}: ZoneRailProps) {
  const t = useT()
  const completeness = zoneCompleteness(canvas)
  const missingCount = (zone: number): number =>
    completeness.find((z) => z.zone === zone)?.missing.length ?? 0

  return (
    <nav aria-label="Canvas zones" style={{ display: 'flex', flexDirection: 'column' }}>
      {PHASES.map((group) => (
        <div key={group.phase} style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: theme.accent,
              padding: '0 6px 5px',
              borderBottom: `1px solid ${theme.border}`,
              marginBottom: 5,
            }}
          >
            {group.phase}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {group.zones.map((zone) => {
              const isActive = zone.id === activeZone
              const missing = missingCount(zone.id)
              return (
                <li key={zone.id}>
                  <button
                    type="button"
                    onClick={() => onSelectZone(zone.id)}
                    aria-current={isActive ? 'true' : undefined}
                    title={`${ZONE_MINUTES[zone.id] ?? ''} · ${
                      missing === 0
                        ? 'complete'
                        : `${missing} item${missing > 1 ? 's' : ''} missing`
                    }`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: 'none',
                      borderRadius: 6,
                      padding: '7px 8px',
                      marginBottom: 1,
                      fontSize: 13,
                      color: isActive ? theme.accent : theme.text,
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? theme.accentSoft : 'transparent',
                    }}
                  >
                    {/* Status dot: green = complete, amber = still has named gaps. */}
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flex: '0 0 8px',
                        background: missing === 0 ? theme.pass : theme.pencil,
                      }}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 20,
                        height: 20,
                        flex: '0 0 20px',
                        borderRadius: 5,
                        fontSize: 11,
                        fontWeight: 700,
                        color: isActive ? theme.onAccent : theme.textMuted,
                        background: isActive ? theme.accent : theme.border,
                      }}
                    >
                      {zone.id}
                    </span>
                    <span style={{ flex: '1 1 auto' }}>{zone.name}</span>
                    {missing > 0 && (
                      <span
                        title={`${missing} item${missing > 1 ? 's' : ''} still missing`}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: theme.textMuted,
                          background: theme.surface2,
                          borderRadius: 999,
                          padding: '1px 7px',
                        }}
                      >
                        {missing}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <button
        type="button"
        onClick={onSelectShoebox}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          border: `1px dashed ${theme.border}`,
          borderRadius: 6,
          padding: '7px 8px',
          fontSize: 13,
          color: theme.textMuted,
          background: 'transparent',
        }}
      >
        📥 Shoebox
      </button>
      {/* Off-ramp signpost (C7): a session is sliceable - stopping is safe and expected.
          Express mode trims the helper copy; the rail itself never changes. */}
      {verbose && (
        <p
          style={{
            margin: '10px 4px 0',
            fontSize: 10.5,
            lineHeight: 1.4,
            color: theme.textFaint,
          }}
        >
          {t('rail.offRamp')}
        </p>
      )}
      {/* The Express way of working (Aleks 2026-07-24), below the off-ramp: shown in
          BOTH modes - in Guided it advertises the fast path, in Express it is the one
          helper line that survives the trim (it explains the mode you are in). */}
      <p
        style={{
          margin: '8px 4px 0',
          fontSize: 10.5,
          lineHeight: 1.4,
          color: theme.textFaint,
        }}
      >
        {t('rail.expressHint')}
      </p>
    </nav>
  )
}

// Rough per-zone time estimates (C7 off-ramps / A2J): sets expectations, never a countdown.
const ZONE_MINUTES: Record<number, string> = {
  1: '~2 min',
  2: '~6 min',
  3: '~3 min',
  4: '~4 min',
  5: '~3 min',
  6: '~4 min',
  7: '~4 min',
  8: '~5 min',
}
