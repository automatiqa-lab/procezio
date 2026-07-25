// v0.4 re-assessment diff (spec 01b Wave 3 G5): what changed since a prior session.
//
// Because every session is a projected event log, comparing two of them is a pure diff of two
// canvases - no special machinery. This reports what moved between a PRIOR canvas (an earlier
// saved session) and the CURRENT one: steps added / removed / relabeled, ideas raised, commitments,
// friction and cases, and how the credibility level shifted. Read-only and deterministic.

import type { Canvas } from '@procezio/schema'
import { credibilityLadder } from './credibility.js'

export interface SessionDiff {
  nodesAdded: number
  nodesRemoved: number
  nodesRelabeled: number
  ideasAdded: number
  /** committed(current) - committed(prior); may be negative if commitments were withdrawn. */
  committedDelta: number
  frictionDelta: number
  casesDelta: number
  credibilityFrom: number
  credibilityTo: number
}

const committedCount = (c: Canvas): number =>
  (c.opportunities ?? []).filter((o) => o.committed === true).length

/** Diff a prior canvas against the current one. Node identity is the node id; relabel = same id,
 * different label. Both directions are reported (added vs removed). */
export function sessionDiff(prior: Canvas, current: Canvas): SessionDiff {
  const priorNodes = new Map((prior.nodes ?? []).map((n) => [n.id, n.label]))
  const curNodes = new Map((current.nodes ?? []).map((n) => [n.id, n.label]))
  let nodesAdded = 0
  let nodesRelabeled = 0
  for (const [id, label] of curNodes) {
    if (!priorNodes.has(id)) nodesAdded += 1
    else if (priorNodes.get(id) !== label) nodesRelabeled += 1
  }
  let nodesRemoved = 0
  for (const id of priorNodes.keys()) if (!curNodes.has(id)) nodesRemoved += 1

  return {
    nodesAdded,
    nodesRemoved,
    nodesRelabeled,
    ideasAdded: (current.opportunities ?? []).length - (prior.opportunities ?? []).length,
    committedDelta: committedCount(current) - committedCount(prior),
    frictionDelta: (current.friction ?? []).length - (prior.friction ?? []).length,
    casesDelta: (current.cases ?? []).length - (prior.cases ?? []).length,
    credibilityFrom: credibilityLadder(prior).level,
    credibilityTo: credibilityLadder(current).level,
  }
}
