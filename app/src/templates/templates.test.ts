// Templates acceptance test (spec 01b section 13, H1).
//
// Named criterion: "every shipped template validates, and applying it to a fresh session builds
// the Understand side (frame + nodes + lanes + edges + data tags + friction) through ordinary
// content events the store accepts, leaving Diverge/Converge (opportunities/scores/cases) empty -
// a templated canvas is indistinguishable from a hand-drawn one." Deterministic; no LLM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCanvasStore, getCanvas, getError } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import { validateTemplate, templateToCandidates, laneIdFor } from './template.js'
import { TEMPLATES } from './templates.generated.js'
import { randomUUID } from 'node:crypto'

function freshStore() {
  return createCanvasStore({
    eventIdProvider: () => randomUUID(),
    tsProvider: () => '2026-07-12T00:00:00.000Z',
  })
}

test('the P2P/O2C/carrier templates ship, each structurally valid', () => {
  const ids = TEMPLATES.map((t) => t.id).sort()
  assert.deepEqual(ids, ['carrier', 'o2c', 'p2p'])
  for (const t of TEMPLATES) {
    assert.deepEqual(validateTemplate(t), [], `${t.id} has no validation errors`)
  }
})

test('laneIdFor slugs an actor label deterministically', () => {
  assert.equal(laneIdFor('AP clerk'), 'ap-clerk')
  assert.equal(laneIdFor('  Finance / Ops  '), 'finance-ops')
  assert.equal(laneIdFor('!!!'), 'actor', 'a label with no alphanumerics falls back')
})

for (const t of TEMPLATES) {
  test(`applying "${t.id}" builds Understand and leaves Diverge/Converge empty`, () => {
    const store = freshStore()
    store.getState().dispatch(buildSessionStartedCandidate(randomUUID(), t.frame.name ?? 'Process'))
    for (const c of templateToCandidates(t, store.getState().sessionId!)) {
      store.getState().dispatch(c)
      assert.equal(getError(store.getState()), null, `${t.id}: the store accepted every candidate`)
    }
    const canvas = getCanvas(store.getState())
    // Understand is populated.
    assert.equal(canvas.nodes.length, t.nodes.length, `${t.id}: every node landed`)
    assert.equal(canvas.edges.length, t.edges.length, `${t.id}: every edge landed`)
    assert.equal(canvas.process.north_star, t.frame.north_star, `${t.id}: the frame set`)
    assert.ok((canvas.friction ?? []).length > 0, `${t.id}: friction seeded`)
    assert.ok((canvas.audit_tags ?? []).length > 0, `${t.id}: a data tag seeded`)
    // Lanes are derived and labelled with the actor.
    const laneIds = new Set(canvas.lanes.map((l) => l.id))
    for (const n of t.nodes) assert.ok(laneIds.has(laneIdFor(n.lane)), `${t.id}: lane for ${n.id}`)
    // Diverge/Converge stay empty - the ideas, scores and case are always the user's.
    assert.equal((canvas.opportunities ?? []).length, 0, `${t.id}: no opportunities seeded`)
    assert.equal((canvas.cases ?? []).length, 0, `${t.id}: no case seeded`)
  })
}

test('a template with a dangling edge is rejected by validateTemplate', () => {
  const broken = structuredClone(TEMPLATES[0]!)
  broken.edges = [{ id: 'x', from: 'ghost', to: broken.nodes[0]!.id, kind: 'sequence' }]
  const errors = validateTemplate(broken)
  assert.ok(
    errors.some((e) => e.includes('unknown node')),
    'a dangling edge is caught before it can half-apply',
  )
})
