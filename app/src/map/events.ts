// M2-03 - the app-boundary event builders for the Zone 2 (Map) surface.
//
// Pure candidate builders like every zone's events.ts - see store/envelope.ts for the
// canonical purity/layering explanation. React Flow is never the source of truth: every
// Map mutation leaves the UI as one of these candidates and only becomes canvas state
// after the store accepts it and re-projects.
//
// Ontology decision (CardContract acceptance #11): the ratified EventType enum has
// NO `node.updated`. The node.* family plus C9's `upsertBy(nodes, node, n=>n.id)`
// IS the update path - NodePayload's own doc reads "the created/updated node".
// So buildNodeUpdatedCandidate emits a `node.created` carrying the SAME id with
// edited metadata; projection upserts it in place. This is in-schema and honours
// schemaTouched=false; it is NOT a positional/side-channel data workaround. The one
// residual gap - Lane.actor cannot be set independently of the lane id through any
// event (C9 ensureLane defaults actor to the lane id) - is flagged as an amendment
// candidate for a future card, not worked around here.

import type { DispatchCandidate } from '../store/canvas-store.js'
// Node/Edge/NodeMetadata are imported from the ratified schema, never redefined
// here (CardContract: "Types imported from @procezio/schema"). The caller builds
// the Node/Edge from these contracts and hands it in; these helpers only wrap it
// in the event envelope shape the store expects.
import type { Edge, Node, NodeMetadata } from '@procezio/schema'
import { humanInk } from '../store/envelope.js'

/**
 * Build the `node.created` candidate dispatched when the toolbar adds a shape. The
 * node's id is minted by the caller at the app edge; its lane materialises through
 * C9 ensureLane when the event is projected (adding a shape in an actor's lane IS
 * the in-schema lane-creation path).
 */
export function buildNodeCreatedCandidate(sessionId: string, node: Node): DispatchCandidate {
  return humanInk(sessionId, 'node.created', { node })
}

/**
 * The candidate dispatched when the inspector edits a node's label/metadata. It carries
 * the SAME node id, so C9's upsertBy replaces the node in place rather than appending a
 * duplicate. Emitted as `node.created` because the ratified EventType enum has no
 * `node.updated` (see the module header's ontology decision); this is the in-schema
 * update path, not a workaround. A documented ALIAS of buildNodeCreatedCandidate - the
 * two are byte-identical by design and aliasing keeps them from ever drifting.
 */
export const buildNodeUpdatedCandidate = buildNodeCreatedCandidate

/**
 * Build the `edge.created` candidate dispatched when two node handles are connected
 * via React Flow's onConnect. The edge id is minted by the caller at the app edge;
 * `kind` is 'sequence' (the normal left-to-right flow).
 */
export function buildEdgeCreatedCandidate(sessionId: string, edge: Edge): DispatchCandidate {
  return humanInk(sessionId, 'edge.created', { edge })
}

/** The six editable per-node metadata fields the inspector exposes (spec v0.2
 * section 6, zone 2), as raw string form inputs before cleaning. */
export interface MetadataForm {
  actor: string
  action: string
  system: string
  input: string
  output: string
  time: string
}

/**
 * Build a schema NodeMetadata from the inspector's form, dropping empty fields so
 * the projected node carries only what the user actually filled in (every field is
 * optional in the schema; exactOptionalPropertyTypes forbids setting a key to
 * undefined, so absent fields are simply not added). Pure - node-testable.
 */
export function nodeMetadataFrom(form: MetadataForm): NodeMetadata {
  const md: NodeMetadata = {}
  const actor = form.actor.trim()
  const action = form.action.trim()
  const system = form.system.trim()
  const input = form.input.trim()
  const output = form.output.trim()
  const time = form.time.trim()
  if (actor) md.actor = actor
  if (action) md.action = action
  if (system) md.system = system
  if (input) md.input = input
  if (output) md.output = output
  if (time) md.time = time
  return md
}
