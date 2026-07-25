// v0.4 - deterministic map analysis: handoff count + HD-2 Connect detection (spec 01b
// section 3/10, decision t7Fd0ny1kLEB).
//
// The structural half of the what-if estimator (F1). Pure arithmetic/counting over the drawn
// map - no LLM, no fuzzy text parsing, no clock. These are the metrics that need no user
// numbers: they read the shape of the process alone, so they are always available and always
// exact. Time-based estimates (cycle time, biggest wait) fold in the tagged quantities and are
// built separately; everything here is a count over nodes/edges/lanes.
//
// HD-2 is the deterministic Connect-candidate signal: a re-key handoff between two
// system-backed steps is duplicate data entry a system link could remove. It is NOT a rule in
// ruleset.yaml because it needs a relational join (edge endpoints -> their nodes' systems)
// that the declarative predicate language deliberately does not express; it is exact code
// instead, and the agent still only words what this function has already decided.

import type { Canvas, Node } from '@procezio/schema'

/** A re-key-between-systems edge: duplicate entry a Connect-rung idea could remove. */
export interface ConnectCandidate {
  edge_id: string
  from: string
  to: string
}

const nodeById = (canvas: Canvas): Map<string, Node> =>
  new Map((canvas.nodes ?? []).map((n) => [n.id, n]))

const isSystemBackedStep = (node: Node | undefined): boolean =>
  node?.type === 'Step' && (node.step_detail?.systems?.length ?? 0) > 0

/**
 * Count handoffs: edges whose two endpoints sit in different lanes (a change of owner). This
 * is the classic handoff metric - every crossing is a place work is passed, waits, and can be
 * dropped. Sequence edges only; a rework back-edge is not a fresh handoff.
 */
export function handoffCount(canvas: Canvas): number {
  const byId = nodeById(canvas)
  let count = 0
  for (const edge of canvas.edges ?? []) {
    if (edge.kind === 'exception-backedge') continue
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (from && to && from.lane !== to.lane) count += 1
  }
  return count
}

/**
 * HD-2: find re-key handoffs between two system-backed steps. Each is a Connect-rung candidate
 * (a system link could remove the duplicate entry). Deterministic and order-stable: candidates
 * follow edge order. The medium must be explicitly 're-key'; absence is never assumed.
 */
export function connectCandidates(canvas: Canvas): ConnectCandidate[] {
  const byId = nodeById(canvas)
  const out: ConnectCandidate[] = []
  for (const edge of canvas.edges ?? []) {
    if (edge.medium !== 're-key') continue
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (isSystemBackedStep(from) && isSystemBackedStep(to)) {
      out.push({ edge_id: edge.id, from: edge.from, to: edge.to })
    }
  }
  return out
}

// --- What-if cycle-time estimate (F1) ----------------------------------------
//
// The time half of the estimator. Tagged quantities are FREE TEXT ("2 days", "3-5 hrs"), so this
// parses conservatively and is always honesty-tagged "estimate, not measurement": it counts only
// what it can confidently read and reports how many fields it had to skip, so it never fabricates
// a total from nothing.

// Working-time units to minutes: 1 day = 8h, 1 week = 5 days.
const UNIT_TO_MIN: Array<{ re: RegExp; min: number }> = [
  { re: /^(?:weeks?|wks?)$/i, min: 60 * 8 * 5 },
  { re: /^(?:days?|d)$/i, min: 60 * 8 },
  { re: /^(?:hours?|hrs?|h)$/i, min: 60 },
  { re: /^(?:minutes?|mins?|m)$/i, min: 1 },
]
const unitMinutes = (unit: string): number | null =>
  UNIT_TO_MIN.find((u) => u.re.test(unit))?.min ?? null

// A number immediately followed by a unit: the atom every duration is built from.
const PAIR = /(\d+(?:\.\d+)?)\s*(weeks?|wks?|days?|hours?|hrs?|minutes?|mins?|[dhm])\b/gi
// A range "3-5 days" / "3 to 5 hrs": two numbers sharing one trailing unit. Deliberately
// UNANCHORED: "about 3-5 days" must hit the same midpoint rule as "3-5 days" - with a
// start anchor, prefix words silently demoted a range to the PAIR fallback, which counted
// only the upper bound and inflated the estimate with no honesty flag.
const RANGE =
  /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(weeks?|wks?|days?|hours?|hrs?|minutes?|mins?|[dhm])\b/i

/**
 * Parse a free-text duration to minutes, or null if nothing is readable. A range ("3-5 days")
 * uses the midpoint; a COMPOUND value ("1 hour 30 min") sums its parts; a lone number with no unit
 * ("42") returns null - the unit is never guessed. Working-time units: 1 day = 8h, 1 week = 5 days.
 */
export function parseDuration(text: string | undefined): number | null {
  if (!text) return null
  const range = RANGE.exec(text)
  if (range) {
    const unit = unitMinutes(range[3]!)
    if (unit === null) return null
    return ((Number(range[1]) + Number(range[2])) / 2) * unit
  }
  // Sum every number+unit pair, so "1 hour 30 min" = 60 + 30 and "2 days" = 960.
  let total = 0
  let matched = false
  for (const m of text.matchAll(PAIR)) {
    const unit = unitMinutes(m[2]!)
    if (unit === null) continue
    total += Number(m[1]) * unit
    matched = true
  }
  return matched ? total : null
}

/** The deterministic cycle-time estimate - always an estimate, never a measurement. */
export interface CycleTimeEstimate {
  /** Total readable minutes across step touch time and wait duration. */
  total_minutes: number
  /** The single longest wait (a bottleneck), if any wait carried a readable duration. */
  biggest_wait: { node_id: string; label: string; minutes: number } | null
  /** How many time fields were counted vs skipped (unreadable/absent) - honesty about coverage. */
  counted: number
  skipped: number
}

/**
 * Estimate cycle time by folding the readable tagged quantities: each Step's touch time and each
 * Wait's duration. Reports the biggest wait as the likely bottleneck. Every output is an estimate
 * from the map, not a measurement; `skipped` says how much time data was missing or unreadable, so
 * the caller can be honest about coverage.
 */
export function cycleTimeEstimate(canvas: Canvas): CycleTimeEstimate {
  let total = 0
  let counted = 0
  let skipped = 0
  let biggest: CycleTimeEstimate['biggest_wait'] = null
  for (const n of canvas.nodes ?? []) {
    if (n.type === 'Step') {
      const m = parseDuration(n.step_detail?.touch_time?.value)
      if (m === null) {
        if (n.step_detail?.touch_time?.value) skipped += 1
      } else {
        total += m
        counted += 1
      }
    } else if (n.type === 'Wait') {
      const m = parseDuration(n.wait_detail?.duration?.value)
      if (m === null) {
        if (n.wait_detail?.duration?.value) skipped += 1
      } else {
        total += m
        counted += 1
        if (biggest === null || m > biggest.minutes) {
          biggest = { node_id: n.id, label: n.label || n.id, minutes: m }
        }
      }
    }
  }
  return { total_minutes: total, biggest_wait: biggest, counted, skipped }
}

/** Format minutes as a rough human duration (working-time units), for the estimate chip. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0 min'
  const dayMin = 60 * 8
  if (minutes >= dayMin) return `~${(minutes / dayMin).toFixed(1)} working days`
  if (minutes >= 60) return `~${(minutes / 60).toFixed(1)} hours`
  return `~${Math.round(minutes)} min`
}
