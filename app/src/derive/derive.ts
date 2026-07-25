// Map-driven autopopulation (Aleks's 2026-07-24 UX request): once the as-is map
// exists, the downstream zones should not start empty - Friction (3), Data & Rules
// (4) and Ideation (5) receive suggestions DERIVED from what the map already says.
//
// Every derivation here is DETERMINISTIC - a pure function of the projected canvas,
// no LLM, no clock, no randomness - so it works keyless at T0 and replays byte-
// identically. Each suggestion cites its map source in its note/title: the user
// must be able to see WHY the canvas is suggesting it (honesty over fluency).
//
// Layering: this module only DERIVES candidate objects. Whether they enter the
// canvas is decided upstream (useAutoDerive dispatches them as agent PENCIL events;
// the human accepts or rejects each one in the pencil review - brake, not steer).
// Suggestion ids are deterministic (`drv-...` slugs, valid schema Ids), which is
// what lets the dispatcher dedupe against the full event log: a suggestion that was
// ever raised - accepted, pending, or rejected - is never raised again.

import { connectCandidates } from '@procezio/core'
import { nodeLabel } from '../nodeLabel.js'
import type {
  Canvas,
  DataTag,
  ExceptionsTag,
  Friction,
  Node,
  Opportunity,
  RulesTag,
} from '@procezio/schema'

/** The shared step label, tolerating a dangling edge endpoint (node already gone). */
function labelOf(node: Node | undefined): string {
  return node === undefined ? 'a step' : nodeLabel(node)
}

/**
 * Friction suggestions from explicit map signals. Only 1:1 signals are used - a
 * marked rework loop IS defect friction, a marked chasing wait IS waiting friction,
 * a re-key handoff IS extra processing. Nothing is inferred beyond what the user
 * (or an accepted agent draft) already recorded on the map.
 */
export function deriveFrictionSuggestions(canvas: Canvas): Friction[] {
  const out: Friction[] = []
  for (const node of canvas.nodes) {
    if (node.step_detail?.rework === true) {
      out.push({
        id: `drv-fr-rework-${node.id}`,
        waste: 'Defects',
        node_id: node.id,
        note: `From the map: a rework loop is marked on "${labelOf(node)}".`,
      })
    }
    if (node.wait_detail?.chasing === true) {
      out.push({
        id: `drv-fr-chasing-${node.id}`,
        waste: 'Waiting',
        node_id: node.id,
        note: `From the map: chasing (hidden touch time) is marked on "${labelOf(node)}".`,
      })
    }
  }
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]))
  for (const edge of canvas.edges) {
    if (edge.medium !== 're-key') continue
    // Pin on the downstream node - that is where the re-typing happens.
    if (!byId.has(edge.to)) continue
    out.push({
      id: `drv-fr-rekey-${edge.id}`,
      waste: 'Extra-processing',
      node_id: edge.to,
      note: `From the map: information is re-keyed on the handoff into "${labelOf(byId.get(edge.to))}".`,
    })
  }
  return out
}

/**
 * Idea (opportunity) suggestions: the deterministic HD-2 Connect detection (core
 * estimator) already names the re-key handoffs between two system-backed steps -
 * each is a textbook Connect candidate, titled with both step names so the idea
 * reads without opening the map.
 */
export function deriveOpportunitySuggestions(canvas: Canvas): Opportunity[] {
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]))
  return connectCandidates(canvas).map((c) => ({
    id: `drv-opp-connect-${c.edge_id}`,
    title: `Connect: stop re-keying between "${labelOf(byId.get(c.from))}" and "${labelOf(byId.get(c.to))}"`,
    target_refs: [c.edge_id],
  }))
}

/** A partial Data & Rules pre-fill - only the axes the map actually signals. */
export interface AuditDraftSuggestion {
  data?: DataTag
  rules?: RulesTag
  exceptions?: ExceptionsTag
}

/**
 * Data & Rules chip pre-fill from the node's own detail panel. PARTIAL by design:
 * an axis with no map signal stays unset for the human to answer - pre-filling it
 * would fabricate evidence ("answer honestly, not hopefully"). These suggestions
 * never become an audit_tag.set by themselves; DataZone shows them as a pre-filled
 * draft and saves only once the profile is complete AND the human has touched it.
 */
export function deriveAuditDraft(node: Node): AuditDraftSuggestion {
  const out: AuditDraftSuggestion = {}
  // Data shape: a step worked in named systems handles system-shaped (structured) data.
  if ((node.step_detail?.systems?.length ?? 0) > 0 || node.metadata?.system?.trim()) {
    out.data = 'structured'
  }
  // Rules: the Decision panel's basis maps 1:1; a standardized step implies written
  // practice, an improvised one implies judgment.
  const basis = node.decision_detail?.basis
  if (basis === 'written-rule') out.rules = 'explicit'
  else if (basis === 'judgment' || basis === 'escalation') out.rules = 'judgment'
  else if (node.step_detail?.standardized === 'standardized') out.rules = 'explicit'
  else if (node.step_detail?.standardized === 'improvised') out.rules = 'judgment'
  // Exceptions: "varies by season/mode" is the map's own off-path signal.
  if (node.varies === true) out.exceptions = 'occasional'
  return out
}
