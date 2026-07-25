// v0.4 keyless scripted demo (spec 01b section 13, N1-N2): the launch gate.
//
// The static demo IS the product (constitution): with no API key, no account, and no model, a
// visitor watches the whole loop - a mapped process, an idea, the commit ceremony, the Challenger
// waking with an evidence-cited challenge, and the improvement case - in under three minutes. It
// is an EVENT-LOG REPLAY: each step dispatches ordinary content events into a fresh session, so
// the demo canvas is a real canvas (exportable, replayable), not a mock. The Challenger's line is
// canned here (no model), but it is the same challenge.issued event a live model would produce.
//
// This module is PURE (sessionId in, an ordered script out), so the whole story is unit-tested
// headlessly: every step's candidates are accepted by the store, and the run reaches a committed
// idea, a challenge, and a drafted case with zero LLM.

import type { CasePayload, ChallengeIssuedPayload, Opportunity, Score } from '@procezio/schema'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { TEMPLATES } from '../templates/templates.generated.js'
import { templateToCandidates } from '../templates/template.js'
import { buildOpportunityCreatedCandidate } from '../ideation/events.js'
import {
  buildOpportunityUpsertCandidate,
  buildScoreCommittedCandidate,
} from '../prioritize/events.js'
import { buildCommitmentCandidate } from '../ceremony/events.js'
import { buildChallengeIssuedCandidate } from '../tasks/challenger.js'
import { buildCaseDraftedCandidate } from '../case/events.js'
import { buildGateCheckedCandidate, GATE_CHECKS } from '../gate/events.js'

/** One beat of the demo: a caption, the zone to fly the camera to, and the events to apply. */
export interface DemoStep {
  caption: string
  zone: number
  candidates: DispatchCandidate[]
  /** When set, this beat woke the Challenger - the app draws the evidence line for it. */
  challenge?: ChallengeIssuedPayload
}

const P2P = TEMPLATES.find((t) => t.id === 'p2p')!
const OPP: Opportunity = { id: 'demo-opp-1', title: 'Auto-match invoices to POs' }
const SCORE: Score = { benefit: 4, effort: 2 }

const CHALLENGE: ChallengeIssuedPayload = {
  opportunity_id: OPP.id,
  tier: 'probe',
  dimension: 'effort',
  message:
    'You scored this low-effort - but your own map says the match reconciles the PO, goods receipt and invoice across systems, and the data tag flags frequent exceptions. Is the effort really a 2?',
  cited_refs: ['p2p-match', 'p2p-a1'],
}

const CASE: CasePayload = {
  opportunity_id: OPP.id,
  figures: [
    {
      label: 'Invoices matched by hand each month',
      value: '~400',
      source_ref: 'p2p-match',
      kind: 'cost',
    },
    {
      label: 'Time released if auto-matched',
      value: 'clerk hours, to redeploy',
      source_ref: 'p2p-chase',
      kind: 'benefit',
      benefit_class: 'capacity-release',
      redeployment_owner: 'AP team lead',
    },
  ],
  assumptions: [
    {
      statement: 'Roughly 400 invoices a month flow through the match',
      source: 'p2p-match',
      confidence: 'low',
      verify_by: 'Pull the invoice count from the ERP for one month',
    },
  ],
}

/**
 * The ordered demo script for a fresh session. Reuses the P2P template for the Understand side,
 * then ideation -> triage -> score+commit -> the commitment -> the Challenger's evidence-cited
 * probe -> the improvement case. Every candidate is a real content event; nothing here needs a
 * model.
 */
export function demoScript(sessionId: string): DemoStep[] {
  return [
    {
      caption: 'Meet a Purchase-to-Pay process, mapped from memory - steps, handoffs, friction.',
      zone: 2,
      candidates: templateToCandidates(P2P, sessionId),
    },
    {
      caption: 'The data tells you where the pain is: the three-way match is slow and error-prone.',
      zone: 4,
      candidates: [],
    },
    {
      caption: 'One idea, raised without judgement: auto-match invoices to POs.',
      zone: 5,
      candidates: [buildOpportunityCreatedCandidate(sessionId, OPP)],
    },
    {
      caption: 'Triaged to Now, then scored: high benefit, low effort.',
      zone: 6,
      candidates: [
        buildOpportunityUpsertCandidate(sessionId, OPP, { triage: 'Now' }),
        buildScoreCommittedCandidate(sessionId, OPP.id, SCORE),
      ],
    },
    {
      caption:
        'The commitment is signed - an irreversible event. Only now does the Challenger wake.',
      zone: 6,
      candidates: [buildCommitmentCandidate(sessionId, [OPP.id], 'demo-user')],
    },
    {
      caption:
        'The Challenger speaks - and every point stands on the canvas. Follow the evidence line back to the map.',
      zone: 6,
      candidates: [buildChallengeIssuedCandidate(sessionId, CHALLENGE)],
      challenge: CHALLENGE,
    },
    {
      caption:
        'The improvement case - every figure traces to a source, capacity is not called savings.',
      zone: 8,
      // The five risk-gate checks clear FIRST: caseStatusFor is gate-aware, so a case
      // drafted behind an uncleared gate would render as "blocked" - the demo's climax
      // must show the case it just promised (same fix as scripts/gen-scenario.mjs).
      candidates: [
        ...GATE_CHECKS.map((check) =>
          buildGateCheckedCandidate(
            sessionId,
            OPP.id,
            check,
            'cleared',
            'Reviewed in the demo walkthrough - no blocker for a pilot.',
          ),
        ),
        buildCaseDraftedCandidate(sessionId, CASE),
      ],
    },
  ]
}
