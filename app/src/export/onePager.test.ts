// One-pager composition acceptance test (spec 01b section 11, E1).
//
// Named criterion: "onePagerModel reads the credibility header, north-star, top opportunities,
// The Ask and the ledger from the canvas and invents nothing; composeOnePagerSvg renders a
// self-contained SVG (no external refs) carrying those fields, at both the sheet and slide size."
// The rasterization (render.ts) is browser-only and not unit-tested; this covers the pure content.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  onePagerModel,
  composeOnePagerSvg,
  composeFrictionMapSvg,
  composeWalkthroughSvg,
  composeHaccpSvg,
  ONE_PAGER_SIZES,
} from './onePager.js'
import type { Canvas } from '@procezio/schema'

const CANVAS = {
  schema_version: '1.2',
  process: {
    name: 'Purchase-to-Pay',
    owner: 'Procurement and AP',
    north_star: 'Invoice cycle time',
  },
  zones: [],
  nodes: [
    {
      id: 'n1',
      type: 'Step',
      lane: 'ap',
      label: 'Match',
      zone: 2,
      metadata: { action: 'Match invoice to PO' },
      step_detail: { touch_time: { value: '15 min', confidence: 'log-checked' } },
    },
  ],
  edges: [],
  friction: [{ id: 'fr1', waste: 'Waiting', node_id: 'n1' }],
  opportunities: [
    { id: 'o1', title: 'Auto-match invoices', committed: true, score: { benefit: 4, effort: 2 } },
    { id: 'o2', title: 'Auto-chase discrepancies', triage: 'Now' },
  ],
  assumptions: [
    {
      statement: 'Volume is ~400/month',
      source: 'gut',
      confidence: 'low',
      verify_by: 'pull the AP report',
    },
    { statement: 'Rework rate 20%', source: 'log', confidence: 'high' },
  ],
  cases: [
    {
      opportunity_id: 'o1',
      figures: [{ label: 'x', value: '1', source_ref: 'n1', kind: 'benefit' }],
    },
  ],
} as unknown as Canvas

test('onePagerModel reads real fields and invents nothing', () => {
  const m = onePagerModel(CANVAS)
  assert.equal(m.processName, 'Purchase-to-Pay')
  assert.equal(m.northStar, 'Invoice cycle time')
  assert.equal(m.figures, 1)
  assert.equal(m.verified, 1, 'one high-confidence assumption is verified')
  assert.equal(m.assumed, 1)
  assert.equal(m.topOpportunities.length, 2, 'committed + Now-pile opportunities')
  assert.equal(m.topOpportunities[0]!.score, 'benefit 4 / effort 2')
  assert.equal(m.ask.what, 'Auto-match invoices', 'The Ask names the committed opportunity')
  assert.equal(m.ask.owner, 'Procurement and AP')
  assert.equal(m.ledger.length, 2)
  assert.equal(m.ledger[0]!.verifyBy, 'pull the AP report', 'the verify plan rides the annex')
  // THE NUMBERS: the case figure itself, its source resolved to the step's human label.
  assert.equal(m.caseFigures.length, 1)
  assert.equal(m.caseFigures[0]!.source, 'Step: Match invoice to PO', 'source_ref resolved')
  // Snapshot + friction + gate progress all read from the canvas.
  assert.ok(
    m.snapshot.some((p) => p.includes('1 nodes')),
    'snapshot counts the map',
  )
  assert.ok(
    m.snapshot.some((p) => p.startsWith('est. cycle')),
    'a tagged touch time yields a cycle estimate',
  )
  assert.deepEqual(m.frictionTop, [{ label: 'Waiting', step: 'Match invoice to PO' }])
  assert.deepEqual(m.gate, { cleared: 0, total: 5 }, 'committed but ungated: 0 of 5 cleared')
})

test('an empty canvas yields an honest, blank-but-valid model', () => {
  const empty = {
    schema_version: '1.2',
    process: { name: 'Untitled process' },
    zones: [],
    nodes: [],
    edges: [],
  } as unknown as Canvas
  const m = onePagerModel(empty)
  assert.equal(m.figures, 0)
  assert.equal(m.topOpportunities.length, 0)
  assert.equal(m.ask.what, '', 'no invented ask when nothing is committed')
})

test('composeOnePagerSvg renders a self-contained SVG carrying the fields', () => {
  const svg = composeOnePagerSvg(CANVAS, 'sheet')
  assert.ok(svg.startsWith('<svg'), 'is an SVG')
  // No external RESOURCE loads (the xmlns namespace URI is not a fetch): no <image>, href, or url().
  assert.ok(!/<image|href\s*=|url\(/i.test(svg), 'no external references (renders under the CSP)')
  assert.ok(svg.includes('Purchase-to-Pay'), 'the process name')
  assert.ok(svg.includes('Invoice cycle time'), 'the north-star')
  assert.ok(svg.includes('THE ASK'), 'The Ask block')
  assert.ok(svg.includes('Auto-match invoices'), 'the top opportunity')
  assert.ok(svg.includes('THE NUMBERS'), 'the numbers section')
  assert.ok(svg.includes('BENEFITS'), 'the benefits column')
  assert.ok(svg.includes('from: Step: Match invoice to PO'), 'the figure cites its source')
  assert.ok(svg.includes('PROCESS SNAPSHOT'), 'the process snapshot strip')
  assert.ok(svg.includes('WHERE IT HURTS'), 'the friction section')
  assert.ok(svg.includes('Risk gate:'), 'the gate verdict')
  assert.ok(svg.includes('verify: pull the AP report'), 'the annex carries the verify plan')
  assert.ok(svg.includes('made with Procezio'), 'the footer')
})

test('the slide size omits the ledger annex and uses 16:9 dimensions', () => {
  const svg = composeOnePagerSvg(CANVAS, 'slide')
  assert.ok(svg.includes(`width="${ONE_PAGER_SIZES.slide.width}"`), '16:9 width')
  assert.ok(!svg.includes('LEDGER ANNEX'), 'the slide is a summary, no ledger annex')
  assert.ok(svg.includes('THE ASK'), 'but still carries The Ask')
})

test('the decision journal (G3) surfaces triaged ideas with their reasons', () => {
  const withReasons = {
    ...CANVAS,
    opportunities: [
      { id: 'o1', title: 'Auto-match invoices', triage: 'Now', triage_reason: 'clear quick win' },
      { id: 'o2', title: 'Rip out the portal', triage: 'No', triage_reason: 'too risky this year' },
    ],
  } as unknown as Canvas
  const m = onePagerModel(withReasons)
  assert.equal(m.decisions.length, 2, 'both triaged-with-reason ideas listed')
  const svg = composeOnePagerSvg(withReasons, 'sheet')
  assert.ok(svg.includes('DECISION JOURNAL'), 'the journal has a section')
  assert.ok(svg.includes('too risky this year'), 'a No reason is defensible in the export')
})

test('the friction-map checkpoint (E5) renders steps and their friction', () => {
  const canvas = {
    schema_version: '1.2',
    process: { name: 'Purchase-to-Pay' },
    zones: [],
    nodes: [{ id: 'n1', type: 'Step', lane: 'a', label: 'Three-way match', zone: 2 }],
    edges: [],
    friction: [{ id: 'f1', node_id: 'n1', waste: 'Waiting', note: 'stalls on mismatch' }],
  } as unknown as Canvas
  const svg = composeFrictionMapSvg(canvas)
  assert.ok(svg.startsWith('<svg'))
  assert.ok(svg.includes('FRICTION MAP'), 'labelled a checkpoint')
  assert.ok(svg.includes('Three-way match'), 'the step')
  assert.ok(svg.includes('stalls on mismatch'), 'its friction')
  assert.ok(!/<image|href\s*=|url\(/i.test(svg), 'self-contained (CSP-safe)')
})

test('the credibility header (E2) counts unconfirmed simulated perspectives', () => {
  const withSim = {
    ...CANVAS,
    simulated_perspectives: [
      { id: 's1', persona_id: 'p1', text: 'a concern' },
      { id: 's2', persona_id: 'p1', text: 'confirmed one', confirmed: true },
    ],
  } as unknown as Canvas
  const m = onePagerModel(withSim)
  assert.equal(m.simulated, 1, 'only the unconfirmed perspective counts')
  assert.ok(composeOnePagerSvg(withSim, 'sheet').includes('1 simulated'), 'shown in the header')
})

test('the walk-through sheet (D6) groups steps by lane with a confirm box, CSP-safe', () => {
  const canvas = {
    schema_version: '1.2',
    process: { name: 'Purchase-to-Pay' },
    lanes: [{ id: 'ap-clerk', actor: 'AP clerk' }],
    zones: [],
    nodes: [{ id: 'n1', type: 'Step', lane: 'ap-clerk', label: 'Three-way match', zone: 2 }],
    edges: [],
  } as unknown as Canvas
  const svg = composeWalkthroughSvg(canvas)
  assert.ok(svg.startsWith('<svg'))
  assert.ok(/WALK-THROUGH SHEET/.test(svg), 'labelled for the doer')
  assert.ok(svg.includes('AP CLERK'), 'grouped by lane actor')
  assert.ok(svg.includes('Three-way match'), 'lists the step')
  assert.ok(svg.includes('<rect'), 'has a confirm/correct box')
  assert.ok(!/<image|href\s*=|url\(/i.test(svg), 'self-contained (CSP-safe)')
})

test('the HACCP worksheet (F6) seeds hazards from the risk deck, CSP-safe', () => {
  const canvas = {
    schema_version: '1.2',
    process: { name: 'Purchase-to-Pay' },
    lanes: [],
    zones: [],
    nodes: [
      {
        id: 'd1',
        type: 'Decision',
        lane: 'a',
        label: 'Spot or contract',
        zone: 2,
        decision_detail: { basis: 'judgment' },
      },
    ],
    edges: [],
  } as unknown as Canvas
  const svg = composeHaccpSvg(canvas)
  assert.ok(svg.startsWith('<svg'))
  assert.ok(/HACCP RISK WORKSHEET/.test(svg))
  assert.ok(svg.includes('Hazard') && svg.includes('Corrective'), 'the HACCP columns')
  assert.ok(/judgment/i.test(svg), 'the hazard is seeded from the risk deck')
  assert.ok(!/<image|href\s*=|url\(/i.test(svg), 'self-contained (CSP-safe)')
})

test('XML-unsafe content in a field is escaped', () => {
  const spicy = {
    ...CANVAS,
    process: { name: 'A & B <ops>', owner: 'x', north_star: 'y' },
  } as unknown as Canvas
  const svg = composeOnePagerSvg(spicy, 'sheet')
  assert.ok(svg.includes('A &amp; B &lt;ops&gt;'), 'ampersands and angle brackets are escaped')
})
