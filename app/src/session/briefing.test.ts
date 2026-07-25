// Re-entry briefing acceptance test (spec 01b section 12, G2).
//
// Named criterion: "reEntryBriefing reports hasContent=false for a blank canvas; for a canvas with
// content it summarizes what is done, lists the top named gaps, and points next at the earliest
// open gap in zone order." Pure and deterministic; the Facilitator may reword it but never decides.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reEntryBriefing } from './briefing.js'
import type { Canvas } from '@procezio/schema'

const blank = {
  schema_version: '1.2',
  process: {},
  zones: [],
  nodes: [],
  edges: [],
} as unknown as Canvas

test('a blank canvas has no content to brief', () => {
  const b = reEntryBriefing(blank)
  assert.equal(b.hasContent, false)
})

test('a canvas with content summarizes done, missing, and the next step', () => {
  const canvas = {
    schema_version: '1.2',
    process: { name: 'Purchase-to-Pay', north_star: 'cycle time' },
    zones: [],
    nodes: [
      { id: 'n1', type: 'Start', lane: 'a', label: 'x', zone: 2 },
      { id: 'n2', type: 'Step', lane: 'a', label: 'y', zone: 2 },
    ],
    edges: [],
    friction: [{ id: 'f1', node_id: 'n2', waste: 'Waiting' }],
    opportunities: [{ id: 'o1', title: 'auto', committed: true, score: { benefit: 4, effort: 2 } }],
  } as unknown as Canvas
  const b = reEntryBriefing(canvas)
  assert.equal(b.hasContent, true)
  assert.ok(b.headline.includes('Purchase-to-Pay'), 'headline names the process')
  assert.ok(
    b.done.some((d) => d.includes('mapped')),
    'reports mapped steps',
  )
  assert.ok(
    b.done.some((d) => d.includes('committed')),
    'reports the commitment',
  )
  assert.ok(b.next.startsWith('Next:') || b.next.includes('complete'), 'gives a next step')
})

test('next points at the earliest open gap in zone order', () => {
  // Frame is only partly filled (no trigger/end_state/owner), so the earliest gap is in Frame
  // (zone 1) - the briefing must point there, not at a later zone.
  const canvas = {
    schema_version: '1.2',
    process: { name: 'P', north_star: 'n' },
    zones: [],
    nodes: [{ id: 'n1', type: 'Start', lane: 'a', label: 'x', zone: 2 }],
    edges: [],
  } as unknown as Canvas
  const b = reEntryBriefing(canvas)
  assert.ok(b.missing.length > 0, 'there are open gaps')
  assert.ok(b.missing[0]!.startsWith('Frame:'), 'the earliest zone with a gap comes first')
  assert.ok(b.next.includes('Frame'), 'and the next step names it')
})
