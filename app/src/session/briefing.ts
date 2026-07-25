// v0.4 re-entry briefing (spec 01b section 12, G1-G2): where you left off, in words.
//
// A session is sliceable - you leave and come back. On re-entry the Facilitator gives a short,
// deterministic briefing: what the process is, what is already on the canvas, the top named gaps
// still open, and the single most useful next step. No LLM is needed (it works on paper); a model,
// if connected, may reword it, but never decides what the briefing says. Pure - canvas in, a small
// structured briefing out - so it is unit-tested headlessly.

import type { Canvas } from '@procezio/schema'
import { zoneCompleteness } from '@procezio/core'

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

export interface ReEntryBriefing {
  /** True when the canvas already has content worth briefing (else a fresh start, no briefing). */
  hasContent: boolean
  headline: string
  /** What is already done, in words. */
  done: string[]
  /** The top named gaps still open, "Zone: gap". */
  missing: string[]
  /** The single most useful next step. */
  next: string
}

/**
 * Build the re-entry briefing from a projected canvas. The "next step" is the first named gap in
 * zone order - the earliest place the method is incomplete - so the briefing always points at the
 * nearest useful move, not a distant one.
 */
export function reEntryBriefing(canvas: Canvas): ReEntryBriefing {
  const nodes = canvas.nodes ?? []
  const opps = canvas.opportunities ?? []
  const committed = opps.filter((o) => o.committed === true).length
  const friction = (canvas.friction ?? []).length
  const cases = (canvas.cases ?? []).length
  const hasContent = nodes.length > 0 || opps.length > 0 || (canvas.process?.name ?? '') !== ''

  const done: string[] = []
  if (canvas.process?.name) done.push(`Framed "${canvas.process.name}"`)
  if (nodes.length > 0) done.push(`${nodes.length} step${nodes.length === 1 ? '' : 's'} mapped`)
  if (friction > 0) done.push(`${friction} friction point${friction === 1 ? '' : 's'} pinned`)
  if (opps.length > 0) done.push(`${opps.length} idea${opps.length === 1 ? '' : 's'} raised`)
  if (committed > 0) done.push(`${committed} committed`)
  if (cases > 0) done.push(`${cases} case${cases === 1 ? '' : 's'} drafted`)

  const gaps = zoneCompleteness(canvas)
  const missing: string[] = []
  for (const z of gaps) {
    for (const item of z.missing) missing.push(`${ZONE_NAMES[z.zone] ?? `Zone ${z.zone}`}: ${item}`)
  }
  const next =
    missing.length > 0
      ? `Next: add ${missing[0]!.replace(/^[^:]+:\s*/, '')} in ${missing[0]!.split(':')[0]}.`
      : 'Every zone reads complete - review the one-pager and export it.'

  return {
    hasContent,
    headline: canvas.process?.name ? `Welcome back to "${canvas.process.name}".` : 'Welcome back.',
    done,
    missing: missing.slice(0, 4),
    next,
  }
}
