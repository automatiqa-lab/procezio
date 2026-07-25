// v0.4 commit ceremony event (spec 01b section 5, D1). The deliberate sign + confirm that
// seals the committed scores and is the ONLY trigger that wakes the Challenger. A content
// event like any other; the store resolves event_id/ts.

import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'

export function buildCommitmentCandidate(
  sessionId: string,
  // Non-empty by contract (the ceremony only fires with >=1 committed idea); the schema
  // requires minItems 1, so the payload types it as a non-empty tuple.
  opportunityIds: [string, ...string[]],
  signedBy: string,
): DispatchCandidate {
  return humanInk(
    sessionId,
    'commitment',
    { opportunity_ids: opportunityIds, signed_by: signedBy },
    { schemaVersion: '1.2' },
  )
}
