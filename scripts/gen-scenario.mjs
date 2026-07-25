// Generate ready-to-load scenario session files (demo/*.pnav) from the shipped templates, for
// hands-on UI testing "basis an existing scenario". Each scenario carries a template through the
// WHOLE loop - pain-first entry, credibility/assumptions, commit ceremony + Challenger wake, the
// risk gate, and a fully-sourced improvement case ready for the one-pager - using the real
// app-edge event builders (the exact candidates the UI would dispatch), so each file stays a
// faithful, replayable session, not a hand-forged log. Run:
//   corepack pnpm --filter @procezio/app run build:node && node scripts/gen-scenario.mjs
// Timestamps are fixed so the output is byte-stable; ids are random (uuids are required).

import { randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createCanvasStore } from '../app/dist/store/canvas-store.js'
import { buildSessionStartedCandidate } from '../app/dist/session.js'
import { templateToCandidates } from '../app/dist/templates/template.js'
import { TEMPLATES } from '../app/dist/templates/templates.generated.js'
import { serializePnav } from '../app/dist/persistence/pnav.js'
import { buildFrameSetCandidate } from '../app/dist/frame/frame.js'
import { buildAssumptionAddedCandidate } from '../app/dist/assumptions/events.js'
import { buildOpportunityCreatedCandidate } from '../app/dist/ideation/events.js'
import {
  buildScoreCommittedCandidate,
  buildOpportunityUpsertCandidate,
} from '../app/dist/prioritize/events.js'
import { buildCommitmentCandidate } from '../app/dist/ceremony/events.js'
import { buildGateCheckedCandidate } from '../app/dist/gate/events.js'
import { buildCaseDraftedCandidate } from '../app/dist/case/events.js'
import { buildNodeUpdatedCandidate } from '../app/dist/map/events.js'

const GATE_CHECKS = [
  'data-privacy',
  'regulatory-compliance',
  'failure-blast-radius',
  'accountability',
  'change-impact-on-people',
]

// Per-template narrative: the pain that starts the session, the north-star it answers to, the one
// committed improvement idea, its benefit/effort score, and the single sourced figure of its case.
// Everything else (the map, lanes, friction) comes from the shipped template unchanged.
const SCENARIOS = {
  p2p: {
    file: 'p2p-scenario.pnav',
    pain: 'Invoices sit for days waiting on a manual three-way match, and month-end is chaos.',
    northStar: 'Cut average invoice cycle time from 3 days to 1.',
    idea: 'Auto-match invoices to purchase orders',
    score: { benefit: 4, effort: 2 },
    assumptions: [
      {
        statement: 'Roughly 400 invoices flow through this process each month.',
        source: 'AP volume report, June',
        confidence: 'high',
      },
      {
        statement: 'About one in five invoices needs manual rework.',
        source: 'gut feel from the AP team',
        confidence: 'low',
      },
    ],
    whyNow: 'Biggest rework driver, and the data is already in the ERP - fastest honest win.',
    maybeIdea: {
      title: 'Vendor portal for invoice status self-service',
      reason: 'Real pain, but needs vendor adoption - revisit after auto-match lands.',
    },
    verifyLow: 'Sample 50 invoices with the AP team and count the rework cases.',
    stepTouch: ['~20 min', '~10 min'],
    waitTime: '~2 days',
    figure: {
      label: 'Hours saved per month on manual matching',
      value: '~55 h',
      benefit_class: 'capacity-release',
      redeployment_owner: 'AP team lead (freed hours go to exception handling)',
    },
    costFigure: {
      label: 'One-off integration + config effort',
      value: '~15 person-days',
    },
    caseAssumption: {
      statement: '400 invoices/month',
      source: 'AP volume report, June',
      confidence: 'high',
    },
  },
  o2c: {
    file: 'o2c-scenario.pnav',
    pain: 'Orders stall on credit holds and nobody sees them until the customer calls, angry.',
    northStar: 'Cut days-sales-outstanding from 45 to 30.',
    idea: 'Auto-release low-risk orders under the credit threshold',
    score: { benefit: 5, effort: 3 },
    assumptions: [
      {
        statement: 'About 60% of orders sit under the auto-release credit threshold.',
        source: 'Credit team export, Q2',
        confidence: 'high',
      },
      {
        statement: 'Most credit holds clear with no change - they just wait for a human.',
        source: 'gut feel from the collections desk',
        confidence: 'low',
      },
    ],
    whyNow: 'Six of ten orders are provably low-risk - the release rule is already written.',
    maybeIdea: {
      title: 'Automated dunning reminders for overdue invoices',
      reason: 'Helps DSO too, but collections owns the tooling - park until the pilot proves out.',
    },
    verifyLow: 'Pull two weeks of credit-hold releases and count the no-change clears.',
    stepTouch: ['~15 min', '~5 min'],
    waitTime: '~1.5 days',
    figure: {
      label: 'Order-to-ship days removed on low-risk orders',
      value: '~1.5 days',
      benefit_class: 'quality-speed',
    },
    costFigure: {
      label: 'Credit-rules setup + finance sign-off effort',
      value: '~10 person-days',
    },
    caseAssumption: {
      statement: '60% of orders are low-risk',
      source: 'Credit team export, Q2',
      confidence: 'high',
    },
  },
  carrier: {
    file: 'carrier-scenario.pnav',
    pain: 'Onboarding a new haulier takes weeks of chasing documents by email; loads wait on it.',
    northStar: 'Cut carrier onboarding from 15 working days to 5.',
    idea: 'Self-serve document portal with automated insurance and credit checks',
    score: { benefit: 4, effort: 3 },
    assumptions: [
      {
        statement: 'Around 20 new carriers are onboarded each quarter.',
        source: 'Carrier master data, H1',
        confidence: 'high',
      },
      {
        statement: 'Most delay is waiting on the carrier to send documents, not our review.',
        source: 'gut feel from the onboarding team',
        confidence: 'low',
      },
    ],
    whyNow: 'Document chasing is the whole bottleneck; a portal removes it at the source.',
    maybeIdea: {
      title: 'Shared carrier scorecard with the transport team',
      reason: 'Valuable, but measurement design needs the transport lead - after the portal.',
    },
    verifyLow: 'Time-stamp the last 10 onboardings: waiting-on-carrier vs our review days.',
    stepTouch: ['~45 min', '~30 min'],
    waitTime: '~4 days',
    figure: {
      label: 'Working days removed from onboarding',
      value: '~10 days',
      benefit_class: 'quality-speed',
    },
    costFigure: {
      label: 'Portal build + integration effort',
      value: '~20 person-days',
    },
    caseAssumption: {
      statement: '20 carriers onboarded per quarter',
      source: 'Carrier master data, H1',
      confidence: 'high',
    },
  },
}

/** Build one full-loop scenario for a template id; returns a one-line summary. */
function generate(templateId, scn) {
  const template = TEMPLATES.find((t) => t.id === templateId)
  if (!template) throw new Error(`${templateId} template not found - run the app build:node first`)

  const store = createCanvasStore({
    eventIdProvider: () => randomUUID(),
    tsProvider: () => '2026-07-12T09:00:00.000Z',
  })
  const dispatch = (c) => store.getState().dispatch(c)
  const sid = randomUUID()
  dispatch(buildSessionStartedCandidate(sid, template.frame.name))
  for (const c of templateToCandidates(template, sid)) dispatch(c)

  // C3 - pain-first: the frustration that started the session, plus the north-star it answers to.
  dispatch(buildFrameSetCandidate(sid, { pain: scn.pain, north_star: scn.northStar }))

  // Anchor the opportunity, the sourced figure and the gate against a real mapped Step.
  const nodes = store.getState().canvas.nodes
  const anchor = nodes.find((n) => n.type === 'Step') ?? nodes[0]
  if (!anchor) throw new Error(`${templateId}: template seeded no nodes to anchor against`)

  // Ideation - one concrete improvement idea, pinned to the step it changes (target_refs).
  const oppId = randomUUID()
  dispatch(
    buildOpportunityCreatedCandidate(sid, {
      id: oppId,
      title: scn.idea,
      target_refs: [anchor.id],
    }),
  )

  // Assumptions feed the credibility ledger: one document-backed (verified), one gut-feel
  // (assumed). Each is born with an id (2026-07-24 amendment: acknowledgeable + citable),
  // and the gut-feel one carries its verify plan - the export gate's demand, answered.
  for (const a of scn.assumptions) {
    const verify = a.confidence === 'low' ? { verify_by: scn.verifyLow } : {}
    dispatch(buildAssumptionAddedCandidate(sid, { ...a, id: randomUUID(), ...verify }))
  }

  // Tagged times on the map (F1): touch time on the first steps, a duration on the first
  // wait - what the estimator's cycle-time line and biggest-wait callout read from.
  const steps = nodes.filter((n) => n.type === 'Step').slice(0, scn.stepTouch.length)
  steps.forEach((n, i) => {
    dispatch(
      buildNodeUpdatedCandidate(sid, {
        ...n,
        step_detail: {
          ...(n.step_detail ?? {}),
          touch_time: { value: scn.stepTouch[i], confidence: 'log-checked' },
        },
      }),
    )
  })
  const wait = nodes.find((n) => n.type === 'Wait')
  if (wait) {
    dispatch(
      buildNodeUpdatedCandidate(sid, {
        ...wait,
        wait_detail: {
          ...(wait.wait_detail ?? {}),
          duration: { value: scn.waitTime, confidence: 'gut-feel' },
        },
      }),
    )
  }

  // Prioritise - the idea is triaged to Now with its taxonomy rung, THEN scored and committed.
  // Without the triage, Zone 6's Now pile cannot show the committed score; without the rung,
  // the to-be composer skips the opportunity entirely (both were missing in earlier scenarios).
  dispatch(
    buildOpportunityUpsertCandidate(
      sid,
      { id: oppId, title: scn.idea, target_refs: [anchor.id] },
      { triage: 'Now', rung: 'Automate', triage_reason: scn.whyNow },
    ),
  )
  // A second idea triaged Maybe WITH its reason - the decision journal shows a
  // defensible no/not-yet, not only the winner (G3).
  const maybeId = randomUUID()
  dispatch(buildOpportunityCreatedCandidate(sid, { id: maybeId, title: scn.maybeIdea.title }))
  dispatch(
    buildOpportunityUpsertCandidate(
      sid,
      { id: maybeId, title: scn.maybeIdea.title },
      { triage: 'Maybe', triage_reason: scn.maybeIdea.reason },
    ),
  )
  dispatch(buildScoreCommittedCandidate(sid, oppId, scn.score))

  // D1 - the signing ceremony writes the commitment that wakes the Challenger. Post-commit only.
  dispatch(buildCommitmentCandidate(sid, [oppId], 'local-user'))

  // Zone 7 - clear all five risk checks so the improvement case is unblocked.
  for (const check of GATE_CHECKS) {
    dispatch(
      buildGateCheckedCandidate(sid, oppId, check, 'cleared', 'Reviewed - no blocker for a pilot.'),
    )
  }

  // Zone 8 - the improvement case: a benefit AND a cost figure (a board expects both sides), each
  // TRACING to the mapped step (named-source gate), with an assumption attached, so the one-pager's
  // credibility header reads honestly and the board-review pass has nothing one-sided to flag.
  dispatch(
    buildCaseDraftedCandidate(sid, {
      opportunity_id: oppId,
      figures: [
        // The benefit cites the FRICTION it removes; the cost cites the step it lands on.
        {
          ...scn.figure,
          source_ref: (store.getState().canvas.friction ?? [])[0]?.id ?? anchor.id,
          kind: 'benefit',
        },
        { ...scn.costFigure, source_ref: anchor.id, kind: 'cost' },
      ],
      assumptions: [scn.caseAssumption],
    }),
  )

  const events = store.getState().exportLog()
  const canvas = store.getState().canvas
  writeFileSync(`demo/${scn.file}`, serializePnav(sid, events))
  return (
    `demo/${scn.file} - ${events.length} events, ${canvas.nodes.length} nodes, ` +
    `${(canvas.friction ?? []).length} friction, ${(canvas.opportunities ?? []).length} opportunity, ` +
    `${(canvas.assumptions ?? []).length} assumptions, ${(canvas.cases ?? []).length} case`
  )
}

mkdirSync('demo', { recursive: true })
for (const [id, scn] of Object.entries(SCENARIOS)) {
  console.log('wrote ' + generate(id, scn))
}
