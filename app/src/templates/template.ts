// v0.4 templates (spec 01b section 13, H1): a starting process for a common flow.
//
// A template is DECLARATIVE crown-jewel data (templates/*.json) - a publishable, runtime-neutral
// description of the Understand side of one process: the Frame, the mapped steps + handoffs, the
// data/rules profile, and the friction. The Diverge and Converge zones are deliberately EMPTY -
// the ideas, scores and case are always the user's, never seeded. Applying a template just
// dispatches ordinary content events into a fresh session, so a templated canvas is
// indistinguishable from a hand-drawn one and replays identically. No LLM is involved.

import type {
  AuditTag,
  DataTag,
  Downtime,
  Edge,
  ExceptionsTag,
  FramePayload,
  Node,
  NodeType,
  RulesTag,
} from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
import { buildFrameSetCandidate } from '../frame/frame.js'
import { buildEdgeCreatedCandidate } from '../map/events.js'
import { buildFrictionPinnedCandidate } from '../friction/events.js'
import { buildAuditTagSetCandidate } from '../data/events.js'

/** One template node: an actor label (its lane) plus the five-shape node fields. */
export interface TemplateNode {
  id: string
  type: NodeType
  /** The actor whose lane this node sits in; slugified to the lane id, kept as the lane label. */
  lane: string
  label: string
}

/** A template: the Frame + the Understand-side canvas. Diverge/Converge stay empty by design. */
export interface Template {
  id: string
  name: string
  description: string
  frame: FramePayload
  nodes: TemplateNode[]
  edges: Edge[]
  audit_tags: AuditTag[]
  friction: Array<{ id: string; node_id: string; waste: Downtime; note?: string }>
}

const NODE_TYPES = new Set<NodeType>(['Start', 'Step', 'Decision', 'Wait', 'End'])
const DATA_TAGS = new Set<DataTag>(['structured', 'semi-structured', 'unstructured'])
const RULES_TAGS = new Set<RulesTag>(['explicit', 'mixed', 'judgment'])
const EXC_TAGS = new Set<ExceptionsTag>(['rare', 'occasional', 'frequent'])
const DOWNTIME = new Set<Downtime>([
  'Defects',
  'Overproduction',
  'Waiting',
  'Non-utilized-talent',
  'Transportation',
  'Inventory',
  'Motion',
  'Extra-processing',
])

/** The lane id for an actor label: lowercased, non-alphanumerics collapsed to single hyphens. */
export function laneIdFor(actor: string): string {
  const slug = actor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  return slug.length > 0 ? slug : 'actor'
}

/**
 * Validate a template structurally before it is applied: known shapes/enums, every edge and
 * friction/tag pinned to a node the template declares. Returns the reasons it is invalid (empty
 * = valid), so a broken community template fails loudly instead of half-applying.
 */
export function validateTemplate(t: Template): string[] {
  const errors: string[] = []
  if (!t.id || !t.name) errors.push('template needs an id and a name')
  if (!t.frame || typeof t.frame.name !== 'string')
    errors.push('template needs a frame with a name')
  const ids = new Set<string>()
  for (const n of t.nodes ?? []) {
    if (ids.has(n.id)) errors.push(`duplicate node id ${n.id}`)
    ids.add(n.id)
    if (!NODE_TYPES.has(n.type)) errors.push(`node ${n.id} has unknown type ${n.type}`)
    if (!n.lane || !n.label) errors.push(`node ${n.id} needs a lane and a label`)
  }
  for (const e of t.edges ?? []) {
    if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`edge ${e.id} references an unknown node`)
  }
  for (const a of t.audit_tags ?? []) {
    if (!ids.has(a.node_id)) errors.push(`audit tag ${a.id} references an unknown node`)
    if (!DATA_TAGS.has(a.data) || !RULES_TAGS.has(a.rules) || !EXC_TAGS.has(a.exceptions))
      errors.push(`audit tag ${a.id} has an unknown enum value`)
  }
  for (const f of t.friction ?? []) {
    if (!ids.has(f.node_id)) errors.push(`friction ${f.id} references an unknown node`)
    if (!DOWNTIME.has(f.waste)) errors.push(`friction ${f.id} has an unknown waste ${f.waste}`)
  }
  return errors
}

/**
 * The ordered content-event candidates that build a template into a fresh session: frame, then
 * every node (each carrying its actor label so the lane reads), edges, data tags, friction. All
 * are human-ink (a template is a starting point the user owns, not an agent draft). The store
 * stamps event_id/ts/seq, so a templated session replays deterministically like any other.
 */
export function templateToCandidates(t: Template, sessionId: string): DispatchCandidate[] {
  const out: DispatchCandidate[] = []
  out.push(buildFrameSetCandidate(sessionId, t.frame))
  for (const tn of t.nodes) {
    const node: Node = {
      id: tn.id,
      type: tn.type,
      lane: laneIdFor(tn.lane),
      label: tn.label,
      zone: 2,
    }
    // node.created with an explicit actor label for the derived lane (NodePayload.actor).
    out.push(humanInk(sessionId, 'node.created', { node, actor: tn.lane }))
  }
  for (const e of t.edges) out.push(buildEdgeCreatedCandidate(sessionId, e))
  for (const a of t.audit_tags) out.push(buildAuditTagSetCandidate(sessionId, a))
  for (const f of t.friction) {
    out.push(
      buildFrictionPinnedCandidate(sessionId, {
        id: f.id,
        node_id: f.node_id,
        waste: f.waste,
        ...(f.note !== undefined ? { note: f.note } : {}),
      }),
    )
  }
  return out
}
