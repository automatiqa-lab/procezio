// v0.4 continuity check (spec 01b Wave 3 B9): the Auditor's script-supervisor pass.
//
// Cross-checks the canvas for CONTRADICTIONS a careful reviewer would catch - references that
// point nowhere, and claims that disagree across the map, the ledger and the case. Purely
// deterministic (read straight from the canvas, no LLM), so it is exact and always available; the
// agent only ever words what this has already found. Pure and isomorphic: canvas in, flags out.

import type { Canvas } from '@procezio/schema'

export interface ContinuityFlag {
  message: string
}

/**
 * Find contradictions across the canvas:
 *  - a friction / audit tag / opportunity target pinned to a node that no longer exists;
 *  - a case figure whose source_ref points at no canvas element;
 *  - a committed opportunity with no score (committed nothing);
 *  - a Step tagged with systems whose data profile says "unstructured" (a likely mismatch).
 * Empty result = the map, ledger and case read consistently.
 */
export function continuityChecks(canvas: Canvas): ContinuityFlag[] {
  const flags: ContinuityFlag[] = []
  const nodeIds = new Set((canvas.nodes ?? []).map((n) => n.id))
  const elementIds = new Set<string>(nodeIds)
  for (const e of canvas.edges ?? []) elementIds.add(e.id)
  for (const a of canvas.audit_tags ?? []) elementIds.add(a.id)
  for (const f of canvas.friction ?? []) elementIds.add(f.id)

  for (const f of canvas.friction ?? []) {
    if (!nodeIds.has(f.node_id))
      flags.push({ message: `Friction "${f.waste}" points at a step that is not on the map.` })
  }
  for (const a of canvas.audit_tags ?? []) {
    if (!nodeIds.has(a.node_id))
      flags.push({ message: `A data/rules tag points at a step that is not on the map.` })
  }
  for (const o of canvas.opportunities ?? []) {
    for (const ref of o.target_refs ?? []) {
      if (!elementIds.has(ref))
        flags.push({ message: `Idea "${o.title}" targets an element that is not on the map.` })
    }
    if (o.committed === true && o.score === undefined)
      flags.push({ message: `Idea "${o.title}" is committed but carries no score.` })
  }
  for (const c of canvas.cases ?? []) {
    for (const fig of c.figures ?? []) {
      if (fig.source_ref && !elementIds.has(fig.source_ref))
        flags.push({ message: `Figure "${fig.label}" cites a source that is not on the canvas.` })
    }
  }
  for (const n of canvas.nodes ?? []) {
    if (
      n.type === 'Step' &&
      (n.step_detail?.systems?.length ?? 0) > 0 &&
      (canvas.audit_tags ?? []).some((a) => a.node_id === n.id && a.data === 'unstructured')
    ) {
      flags.push({
        message: `"${n.label || n.id}" runs on a system but its data is tagged unstructured - one of the two is likely wrong.`,
      })
    }
  }
  return flags
}
