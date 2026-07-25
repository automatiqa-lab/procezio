// v0.4 "recalculating" GPS agent (spec 01b section 2, A3): soft rerouting on zone jumps.
//
// Navigation is never blocked - you can jump anywhere. But like a satnav that says "recalculating"
// when you leave the route, the Facilitator softly points out when you have jumped AHEAD of an
// unfinished earlier zone, naming the nearest gap so you can double back when ready. It is a nudge,
// not a gate (brake-not-steer): it returns a message to show, or null when the jump is clean. Pure
// and deterministic - it reads the named-missing-items projection (zoneCompleteness), no LLM.

import type { Canvas } from '@procezio/schema'
import { zoneCompleteness } from './completeness.js'

const ZONE_NAMES: Record<number, string> = {
  1: 'Frame',
  2: 'Map',
  3: 'Friction',
  4: 'Data & rules',
  5: 'Ideation',
  6: 'Prioritize',
  7: 'Risk gate',
  8: 'Improvement case',
}

/**
 * The soft reroute message for jumping to `targetZone`, or null when nothing earlier is unfinished.
 * Finds the EARLIEST zone before the target that still has named missing items and points there -
 * never blocking, just recalculating.
 */
export function recalcRoute(canvas: Canvas, targetZone: number): string | null {
  if (targetZone <= 1) return null
  const gaps = zoneCompleteness(canvas)
  for (const z of gaps) {
    if (z.zone >= targetZone) break
    if (z.missing.length > 0) {
      const name = ZONE_NAMES[z.zone] ?? `Zone ${z.zone}`
      return `Recalculating… ${name} still needs ${z.missing[0]}. Jump back when you're ready - I won't block you.`
    }
  }
  return null
}
