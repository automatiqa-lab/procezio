// C-TASK - the post-commit anti-anchoring challenge (the LLM words what the rules decided).
//
// The layering principle, made concrete (spec v0.2 sections 9-10, zone 6): the zone-6
// anti-anchoring rule ALREADY decided - it stays silent until a score is committed, then
// fires exactly once on score.committed to raise at most one evidence-cited challenge. This
// task never makes that decision; it only WORDS the single challenge, citing zone-2/zone-4
// evidence the caller assembled, with keep-or-revise framing. On ANY failure it returns
// null and no challenge is raised - so turning the model off degrades the prompt, never
// correctness (constitution p6: the agent accelerates, never gates).
//
// Pure of DOM/React and of the network (the client's transport is injected), so it runs
// headless under `node --test` with a stub client.

import type { LlmClient } from '@procezio/core'
import type { ChallengePayload } from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { agentPencil } from '../store/envelope.js'
import { getPrompt } from './prompts.js'
import { makeValidator } from './validator.js'

/**
 * The render inputs for the challenge prompt's placeholders. The caller assembles the
 * evidence string from zone-2/zone-4 canvas data; this task does not read the canvas.
 */
export interface ChallengeCtx {
  opportunityId: string
  title: string
  benefit: number
  effort: number
  evidence: string
}

const DIMENSIONS = new Set(['benefit', 'effort'])

/**
 * Validate a challenge output structurally: the committed opportunity id, a benefit/effort
 * dimension, a message, and at least one cited evidence ref. A hand type-guard (with the
 * ajv-shaped errors the repair loop reads) - the schema package ships precompiled
 * validators only for the top-level Canvas/EventEnvelope, and the store re-validates every
 * dispatched event against the ratified contract anyway.
 */
const validateChallenge = makeValidator(
  (d: unknown): d is ChallengePayload => {
    if (typeof d !== 'object' || d === null) return false
    const o = d as Partial<ChallengePayload>
    if (typeof o.opportunity_id !== 'string' || o.opportunity_id.length === 0) return false
    if (typeof o.dimension !== 'string' || !DIMENSIONS.has(o.dimension)) return false
    if (typeof o.message !== 'string' || o.message.length === 0) return false
    if (!Array.isArray(o.evidence_refs) || o.evidence_refs.length === 0) return false
    for (const ref of o.evidence_refs) {
      if (typeof ref !== 'string' || ref.length === 0) return false
    }
    return true
  },
  '',
  'must be {opportunity_id, dimension:"benefit"|"effort", message, evidence_refs:[id,...]}',
)

/**
 * Ask the model to word the single challenge for `ctx`. Returns the validated payload with
 * its opportunity_id FORCED to ctx.opportunityId (never trust the model to echo the id it
 * was given), or null if the model is unreachable or never produces a valid challenge (no
 * challenge is raised).
 */
export async function buildChallenge(
  client: LlmClient,
  ctx: ChallengeCtx,
): Promise<ChallengePayload | null> {
  const p = getPrompt('challenge', {
    opportunity_id: ctx.opportunityId,
    title: ctx.title,
    benefit: ctx.benefit,
    effort: ctx.effort,
    evidence: ctx.evidence,
  })
  try {
    const result = await client.requestJson(
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      validateChallenge,
    )
    return result.ok ? { ...result.value, opportunity_id: ctx.opportunityId } : null
  } catch {
    return null
  }
}

/**
 * Turn the challenge into an AGENT-authored candidate (challenge.raised), born pencil so
 * the human reviews it (two-ink rule, M2-16). The payload is the bare ChallengePayload with
 * the forced opportunity_id. Returns null when no challenge could be worded (the methodology
 * works with no model - constitution p6).
 */
export async function challengeCandidate(
  client: LlmClient,
  sessionId: string,
  ctx: ChallengeCtx,
): Promise<DispatchCandidate | null> {
  const payload = await buildChallenge(client, ctx)
  if (payload === null) return null
  return agentPencil(sessionId, 'challenge.raised', payload, 'agent', { schemaVersion: '1.0' })
}
