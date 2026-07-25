// v0.4 composer event builder (spec 01b section 9). Accepting a target-state snapshot into the
// improvement case logs a tobe.snapshot.accepted per committed opportunity - the composer is
// deterministic and the LLM only names; this records WHICH elements changed under which rung
// and the estimator delta, always "hypothesis, not a promise".

import type { EstimatorDelta, TaxonomyRung } from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'

export interface ToBeChangeInput {
  element_ref: string
  rung: TaxonomyRung
  note?: string
}

/** The model's optional human-facing labelling of the snapshot (ComposerNamingOutput). */
export interface ToBeNaming {
  name: string
  narrative: string
}

export function buildToBeSnapshotAcceptedCandidate(
  sessionId: string,
  opportunityId: string,
  changes: readonly ToBeChangeInput[],
  delta?: EstimatorDelta,
  naming?: ToBeNaming,
): DispatchCandidate {
  return humanInk(
    sessionId,
    'tobe.snapshot.accepted',
    {
      opportunity_id: opportunityId,
      changes: changes.map((c) => ({
        element_ref: c.element_ref,
        rung: c.rung,
        ...(c.note !== undefined ? { note: c.note } : {}),
      })),
      ...(delta !== undefined ? { delta } : {}),
      ...(naming !== undefined ? { name: naming.name, narrative: naming.narrative } : {}),
    },
    { schemaVersion: '1.2' },
  )
}
