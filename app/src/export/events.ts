// v0.4 checkpoint export event (spec 01b section 11, E5). A phase-boundary artifact was exported
// (e.g. the friction map after Understand) - value delivered before the whole case is complete.
// Human ink; audit-family (the projection does not build canvas state from it).

import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'

export function buildCheckpointExportedCandidate(
  sessionId: string,
  checkpoint: 'understand' | 'diverge' | 'converge' | 'friction-map' | 'one-pager',
  format: 'png' | 'pdf' | 'slide' = 'png',
): DispatchCandidate {
  return humanInk(
    sessionId,
    'checkpoint.exported',
    { checkpoint, format },
    { schemaVersion: '1.2' },
  )
}
