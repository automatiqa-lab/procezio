// v0.4 - zone completeness as NAMED MISSING ITEMS, never percentages (spec 01b section 2, A2).
//
// The zone rail shows what is still missing per zone, in words - "a north-star metric", "a
// Start node" - not a progress bar. Percentages fake precision and pressure the user; a named
// gap is honest and actionable, and it is exactly what the Auditor's gap-probes reference.
//
// Pure + deterministic: a function of the projected Canvas alone. No clock, no RNG, no LLM.
// This is a derived VIEW - it builds no events and changes no state; it reads the same Canvas
// that project() produced. The order of items is fixed (by the checks below) so the output is
// stable across runs.

import type { Canvas } from '@procezio/schema'

/** The named gaps still open in one zone. An empty `missing` means the zone reads complete. */
export interface ZoneCompleteness {
  zone: number
  /** Human-readable missing items, in a fixed order. Never a count or percentage. */
  missing: string[]
}

const blank = (s: string | undefined): boolean => (s ?? '').trim().length === 0

/**
 * Compute the named missing items for all eight zones from a projected Canvas. Always returns
 * one entry per zone (1-8), in order; a zone with no gaps has an empty `missing` list.
 */
export function zoneCompleteness(canvas: Canvas): ZoneCompleteness[] {
  const nodes = canvas.nodes ?? []
  const steps = nodes.filter((n) => n.type === 'Step')
  const opportunities = canvas.opportunities ?? []
  const friction = canvas.friction ?? []
  const auditTags = canvas.audit_tags ?? []
  const gates = canvas.gates ?? []
  const cases = canvas.cases ?? []

  const result: ZoneCompleteness[] = []
  const push = (zone: number, missing: string[]) => result.push({ zone, missing })

  // Zone 1 - Frame: the anchor fields that every later score answers to.
  const frame: string[] = []
  const p = canvas.process
  if (blank(p?.north_star)) frame.push('a north-star metric')
  if (blank(p?.name)) frame.push('a process name')
  if (blank(p?.trigger)) frame.push('the trigger')
  if (blank(p?.end_state)) frame.push('what done looks like')
  if (blank(p?.owner)) frame.push('the process owner')
  push(1, frame)

  // Zone 2 - Map: a real flow needs a start, an end, and some steps between.
  const map: string[] = []
  if (nodes.length === 0) map.push('a process map (no steps drawn yet)')
  else {
    if (!nodes.some((n) => n.type === 'Start')) map.push('a Start node')
    if (steps.length === 0) map.push('at least one Step')
    if (!nodes.some((n) => n.type === 'End')) map.push('an End node')
  }
  push(2, map)

  // Zone 3 - Friction: steps exist but no waste has been pinned.
  const frictionGaps: string[] = []
  if (steps.length > 0 && friction.length === 0) {
    frictionGaps.push('friction (no waste pinned yet)')
  }
  push(3, frictionGaps)

  // Zone 4 - Data & rules: steps without a data/rules/exceptions profile.
  const dataGaps: string[] = []
  const profiled = new Set(auditTags.map((a) => a.node_id))
  const unprofiled = steps.filter((s) => !profiled.has(s.id))
  if (steps.length > 0 && unprofiled.length > 0) {
    dataGaps.push(
      `a data/rules profile for ${unprofiled.length} step${unprofiled.length > 1 ? 's' : ''}`,
    )
  }
  push(4, dataGaps)

  // Zone 5 - Ideation: at least one improvement idea must exist before scoring.
  const ideation: string[] = []
  if (opportunities.length === 0) ideation.push('at least one improvement idea')
  push(5, ideation)

  // Zone 6 - Prioritize: ideas need triage, then committed scores for the Now pile.
  const prioritize: string[] = []
  if (opportunities.length > 0) {
    if (!opportunities.some((o) => o.triage !== undefined)) prioritize.push('triage of the ideas')
    const now = opportunities.filter((o) => o.triage === 'Now')
    const scoredNow = now.filter((o) => o.committed === true)
    if (now.length > 0 && scoredNow.length === 0)
      prioritize.push('a committed score for the Now pile')
  }
  push(6, prioritize)

  // Zone 7 - Risk gate: EACH committed idea must clear its OWN risk checks. Scope the gates to
  // the committed opportunities' ids - a global check would falsely pass a committed idea that
  // has no gates just because some other idea does.
  const risk: string[] = []
  const committed = opportunities.filter((o) => o.committed === true)
  if (committed.length > 0) {
    const committedIds = new Set(committed.map((o) => o.id))
    const gatesForCommitted = gates.filter((g) => committedIds.has(g.opportunity_id))
    const anyCommittedUnchecked = committed.some(
      (o) => !gatesForCommitted.some((g) => g.opportunity_id === o.id),
    )
    if (anyCommittedUnchecked) risk.push('the risk checks')
    else if (gatesForCommitted.some((g) => g.status === 'open')) {
      risk.push('open risk items to clear')
    }
  }
  push(7, risk)

  // Zone 8 - Improvement case: a committed idea needs a drafted case. (The named-source
  // export gate - every figure sourced and confidence-tagged - is a credibility check in its
  // own module, not a zone-completeness item.)
  const caseGaps: string[] = []
  if (committed.length > 0 && cases.length === 0) {
    caseGaps.push('the improvement case')
  }
  push(8, caseGaps)

  return result
}
