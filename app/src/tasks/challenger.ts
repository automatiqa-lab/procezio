// v0.4 C-TASK - the Challenger's graded interjection (the rules wake it; the LLM words it).
//
// Spec v0.4 section 5 (decision B3): a commitment wakes the Challenger. WHICH rung fires
// (probe/alert/challenge) is decided in core by challengeTier - a pure function of how many
// challenges an opportunity has already drawn. WHICH dimension is questioned is decided here,
// deterministically, from the committed score. The model only WORDS the rung it is handed and
// lists the canvas element ids its point stands on (cited_refs -> the evidence line). It never
// decides whether to speak, never picks the rung, never invents an id. On any failure, or if
// the model cites nothing that exists on the canvas, this returns null and no challenge is
// raised (the methodology works with no model - constitution p6).
//
// Pure of DOM/network (client transport injected), so it runs headless with a stub client.

import type { LlmClient, ChallengeTier } from '@procezio/core'
import type { Canvas, ChallengeIssuedOutput, ChallengeIssuedPayload } from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { agentPencil, humanInk } from '../store/envelope.js'
import { getPrompt } from './prompts.js'
import { makeValidator } from './validator.js'
import { nodeLabel } from '../nodeLabel.js'

/**
 * Assemble the zone-2/zone-4/zone-3 evidence the challenge may cite, each line tagged with the
 * element id the model must reference in cited_refs (steps, then data/rules tags, then
 * friction). Shared by the Prioritize zone and the commit ceremony.
 */
export function assembleEvidence(canvas: Canvas): string {
  const lines: string[] = []
  for (const n of canvas.nodes) {
    lines.push(
      `[${n.id}] step "${nodeLabel(n)}" (${n.type}${n.metadata?.system ? `, system ${n.metadata.system}` : ''})`,
    )
  }
  for (const a of canvas.audit_tags ?? []) {
    lines.push(
      `[${a.id}] data/rules for ${a.node_id}: ${a.data} data, ${a.rules} rules, ${a.exceptions} exceptions`,
    )
  }
  for (const f of canvas.friction ?? []) {
    lines.push(`[${f.id}] friction on ${f.node_id}: ${f.waste}${f.note ? ` (${f.note})` : ''}`)
  }
  return lines.length > 0 ? lines.join('\n') : '(the canvas has no mapped steps or data tags yet)'
}

/**
 * The set of canvas element ids a challenge is allowed to cite (steps, data tags, friction).
 * cited_refs the model returns are filtered to this set so the evidence line never dangles.
 */
export function citableRefs(canvas: Canvas): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const n of canvas.nodes) ids.add(n.id)
  for (const a of canvas.audit_tags ?? []) ids.add(a.id)
  for (const f of canvas.friction ?? []) ids.add(f.id)
  return ids
}

/**
 * The dimension to question, decided deterministically from the committed score (not by the
 * model): a low effort score is the more common over-optimism, so challenge effort when it was
 * scored low relative to benefit; otherwise challenge the benefit. The message still has to
 * stand on cited evidence - this only picks which side of the score to press.
 */
export function challengedDimension(benefit: number, effort: number): 'benefit' | 'effort' {
  return effort <= benefit ? 'effort' : 'benefit'
}

/** The render inputs for the challenge-issued prompt. The caller assembles evidence + tier. */
export interface ChallengeIssuedCtx {
  opportunityId: string
  title: string
  benefit: number
  effort: number
  tier: ChallengeTier
  dimension: 'benefit' | 'effort'
  evidence: string
  /** The ids the model is allowed to cite; foreign ids are dropped (no dangling evidence line). */
  citable: ReadonlySet<string>
}

/** Validate {message, cited_refs}: a non-empty message and at least one non-empty ref. */
const validateChallengeIssued = makeValidator(
  (d: unknown): d is ChallengeIssuedOutput => {
    if (typeof d !== 'object' || d === null) return false
    const o = d as { message?: unknown; cited_refs?: unknown }
    if (typeof o.message !== 'string' || o.message.trim().length === 0) return false
    if (!Array.isArray(o.cited_refs) || o.cited_refs.length === 0) return false
    return o.cited_refs.every((r) => typeof r === 'string' && r.length > 0)
  },
  '',
  'must be {message, cited_refs:[id,...]}',
)

/**
 * Ask the Challenger to word the graded interjection for `ctx`, keeping only cited_refs that
 * exist on the canvas. Returns the built challenge.issued PAYLOAD (opportunity_id forced to the
 * committed one, never trusted from the model), or null if the model is unreachable, produces
 * nothing valid, or cites no element that is actually on the canvas.
 */
export async function runChallengeIssued(
  client: LlmClient,
  ctx: ChallengeIssuedCtx,
): Promise<ChallengeIssuedPayload | null> {
  const p = getPrompt('challenge-issued', {
    opportunity_id: ctx.opportunityId,
    title: ctx.title,
    benefit: ctx.benefit,
    effort: ctx.effort,
    tier: ctx.tier,
    dimension: ctx.dimension,
    evidence: ctx.evidence,
  })
  try {
    const result = await client.requestJson(
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      validateChallengeIssued,
    )
    if (!result.ok) return null
    const refs = result.value.cited_refs.map((r) => r.trim()).filter((r) => ctx.citable.has(r))
    if (refs.length === 0) return null
    return {
      opportunity_id: ctx.opportunityId,
      tier: ctx.tier,
      dimension: ctx.dimension,
      message: result.value.message.trim(),
      cited_refs: refs as [string, ...string[]],
    }
  } catch {
    return null
  }
}

/**
 * Turn a challenge.issued payload into an AGENT-authored candidate, born pencil (two-ink rule):
 * the human keeps or revises the score, and the challenge sits as a suggestion until then. The
 * author id is 'challenger' so the persona is visible in provenance and the bench.
 */
export function buildChallengeIssuedCandidate(
  sessionId: string,
  payload: ChallengeIssuedPayload,
): DispatchCandidate {
  return agentPencil(sessionId, 'challenge.issued', payload, 'challenger')
}

/**
 * The human's response to a challenge (challenge.answered): keep the score, revise it, or just
 * acknowledge. Human ink - the human always decides; this closes the challenge-verify-respond
 * grammar and lets the evidence line clear.
 */
export function buildChallengeAnsweredCandidate(
  sessionId: string,
  opportunityId: string,
  response: 'kept' | 'revised' | 'acknowledged',
): DispatchCandidate {
  return humanInk(
    sessionId,
    'challenge.answered',
    { opportunity_id: opportunityId, response },
    { schemaVersion: '1.2' },
  )
}
