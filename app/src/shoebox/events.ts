// v0.4 Shoebox event builders (spec 01b section 7). Pure candidate constructors, like the
// other zones: event_id/ts are resolved by the store's injected providers.

import type { ExtractionChip, Node } from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { agentPencil, humanInk } from '../store/envelope.js'

/** Add a note or file to the Shoebox. Content stays local; consent is a separate event. */
export function buildShoeboxItemAddedCandidate(
  sessionId: string,
  item: { item_id: string; kind: 'note' | 'file'; name?: string; content_type?: string },
): DispatchCandidate {
  return humanInk(
    sessionId,
    'shoebox.item.added',
    {
      item_id: item.item_id,
      kind: item.kind,
      ...(item.name !== undefined ? { name: item.name } : {}),
      ...(item.content_type !== undefined ? { content_type: item.content_type } : {}),
    },
    { schemaVersion: '1.2' },
  )
}

/** Consent one Shoebox item's content to reach the configured model (per-file opt-in). */
export function buildShoeboxItemConsentedCandidate(
  sessionId: string,
  itemId: string,
): DispatchCandidate {
  return humanInk(
    sessionId,
    'shoebox.item.consented',
    { item_id: itemId },
    { schemaVersion: '1.2' },
  )
}

/** Log the Auditor's extraction from a consented item (agent-authored, born pencil). */
export function buildExtractionResultCandidate(
  sessionId: string,
  sourceItemId: string,
  chips: readonly ExtractionChip[],
): DispatchCandidate {
  return agentPencil(
    sessionId,
    'extraction.result',
    {
      source_item_id: sourceItemId,
      chips: chips.map((c) => ({ text: c.text, ...(c.suggests ? { suggests: c.suggests } : {}) })),
    },
    'auditor',
  )
}

/** A pencil Step node created from an accepted Shoebox chip (agent draft the human keeps). */
export function buildShoeboxPencilNodeCandidate(
  sessionId: string,
  nodeId: string,
  label: string,
): DispatchCandidate {
  const node: Node = { id: nodeId, type: 'Step', lane: 'unassigned', label, zone: 2 }
  return agentPencil(sessionId, 'node.created', { node }, 'auditor')
}
