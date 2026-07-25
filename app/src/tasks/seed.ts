// C-TASK #1a - seed-skeleton: the agent drafts a rough map from a typed description.
//
// The cold-start behavior (spec v0.2 section 10, zone 2): rather than a blank canvas, the
// user types a plain description and the agent sketches a first map - Start/Step/Decision/
// Wait/End nodes in lanes, connected left to right. It is BORN PENCIL (agent-authored):
// nothing is truth until the human accepts each item (two-ink rule, M2-16). The agent
// invents nothing beyond the description; a failure yields null and the canvas stays blank
// (the methodology works with no model - constitution p6).
//
// Pure of DOM/network (client transport injected), so it runs headless with a stub client.

import type { LlmClient } from '@procezio/core'
import type { Edge, Node } from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { agentPencil } from '../store/envelope.js'
import { getPrompt } from './prompts.js'
import { makeValidator } from './validator.js'

/** The T1/T2 seed output (schema SeedSkeletonOutput): a rough map to correct. */
export interface SeedOutput {
  lanes?: Array<{ id: string; actor?: string }>
  nodes: Node[]
  edges?: Edge[]
}

const NODE_TYPES = new Set(['Start', 'Step', 'Decision', 'Wait', 'End'])

/**
 * Validate a seed output structurally: nodes with the five shapes, a lane and a label,
 * and edges wired to node ids. A hand type-guard (with ajv-shaped errors for the repair
 * loop) - the schema ships precompiled validators only for Canvas/EventEnvelope, and the
 * store re-validates every dispatched node/edge against the ratified contract anyway.
 */
const validateSeed = makeValidator(
  (d: unknown): d is SeedOutput => {
    if (typeof d !== 'object' || d === null) return false
    const o = d as { nodes?: unknown; edges?: unknown }
    if (!Array.isArray(o.nodes) || o.nodes.length === 0) return false
    for (const n of o.nodes) {
      const node = n as Partial<Node>
      if (typeof node.id !== 'string' || node.id.length === 0) return false
      if (typeof node.type !== 'string' || !NODE_TYPES.has(node.type)) return false
      if (typeof node.lane !== 'string' || node.lane.length === 0) return false
      if (typeof node.label !== 'string' || node.label.length === 0) return false
    }
    if (o.edges !== undefined) {
      if (!Array.isArray(o.edges)) return false
      for (const e of o.edges) {
        const edge = e as Partial<Edge>
        if (
          typeof edge.id !== 'string' ||
          typeof edge.from !== 'string' ||
          typeof edge.to !== 'string'
        )
          return false
      }
    }
    return true
  },
  '',
  'must be {nodes:[{id,type,lane,label}], edges?:[{id,from,to}]}',
)

/**
 * Ask the model to draft a map from `description`. Returns the validated seed, or null if
 * the model is unreachable or never produces a valid map (the canvas stays blank).
 */
export async function seedSkeleton(
  client: LlmClient,
  description: string,
): Promise<SeedOutput | null> {
  const p = getPrompt('seed-skeleton', { description })
  try {
    const result = await client.requestJson(
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      validateSeed,
    )
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

/**
 * Turn a seed output into AGENT-authored candidates (node.created + edge.created), each
 * born pencil so the human reviews it. The lane actor rides on the node.created (the
 * projection folds it onto the derived lane). zone is forced to 2 (the Map). Ids come
 * from the model; the store re-validates and the event store re-derives pencil from the
 * agent author - a seed can never masquerade as accepted ink.
 */
export function seedCandidates(sessionId: string, seed: SeedOutput): DispatchCandidate[] {
  const laneActor = new Map((seed.lanes ?? []).map((l) => [l.id, l.actor]))
  const out: DispatchCandidate[] = []
  for (const n of seed.nodes) {
    const node: Node = { id: n.id, type: n.type, lane: n.lane, label: n.label, zone: 2 }
    const actor = laneActor.get(n.lane)
    out.push(
      agentPencil(
        sessionId,
        'node.created',
        actor !== undefined && actor.length > 0 ? { node, actor } : { node },
        'agent',
        { schemaVersion: '1.0' },
      ),
    )
  }
  for (const e of seed.edges ?? []) {
    const edge: Edge = { id: e.id, from: e.from, to: e.to, kind: e.kind ?? 'sequence' }
    out.push(agentPencil(sessionId, 'edge.created', { edge }, 'agent', { schemaVersion: '1.0' }))
  }
  return out
}
