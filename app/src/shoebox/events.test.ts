// Shoebox event-builder acceptance tests (spec 01b section 7).
//
// Named criterion: "added/consented are human-authored ink; the Auditor's extraction.result and
// the pencil node it seeds are agent-authored, born pencil; the pencil node is a Step in the
// unassigned lane at zone 2, so it lands as a draft the human accepts or rejects on the map."

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildShoeboxItemAddedCandidate,
  buildShoeboxItemConsentedCandidate,
  buildExtractionResultCandidate,
  buildShoeboxPencilNodeCandidate,
} from './events.js'

test('added and consented are human-authored, ink', () => {
  const added = buildShoeboxItemAddedCandidate('sess', { item_id: 'i1', kind: 'note', name: 'x' })
  const consented = buildShoeboxItemConsentedCandidate('sess', 'i1')
  for (const c of [added, consented]) {
    assert.equal(c.author.kind, 'human', 'the human owns their Shoebox')
    assert.equal(c.provenance.state, 'ink', 'their own items are ink, not pencil')
    assert.equal(c.schema_version, '1.2')
  }
  assert.equal(added.type, 'shoebox.item.added')
  assert.equal(consented.type, 'shoebox.item.consented')
})

test('extraction.result is agent-authored (auditor), born pencil, trimming empty suggests', () => {
  const ev = buildExtractionResultCandidate('sess', 'i1', [
    { text: 'reconcile GR/IR', suggests: 'add a step' },
    { text: 'manual spreadsheet' },
  ])
  assert.equal(ev.type, 'extraction.result')
  assert.equal(ev.author.kind, 'agent')
  assert.equal(ev.author.id, 'auditor', 'the Auditor owns extraction')
  assert.equal(ev.provenance.state, 'pencil', 'a candidate the human accepts')
  const payload = ev.payload as { source_item_id: string; chips: Array<Record<string, unknown>> }
  assert.equal(payload.source_item_id, 'i1', 'the chip cites its source for the ledger')
  assert.deepEqual(
    Object.keys(payload.chips[1]!),
    ['text'],
    'a chip with no suggests omits the key',
  )
})

test('an accepted chip seeds a pencil Step in the unassigned lane at zone 2', () => {
  const ev = buildShoeboxPencilNodeCandidate('sess', 'n1', 'reconcile GR/IR')
  assert.equal(ev.type, 'node.created')
  assert.equal(ev.author.kind, 'agent')
  assert.equal(
    ev.provenance.state,
    'pencil',
    'born pencil - the human keeps or discards on the map',
  )
  const node = (ev.payload as { node: { type: string; lane: string; zone: number; label: string } })
    .node
  assert.equal(node.type, 'Step')
  assert.equal(node.lane, 'unassigned', 'no actor assumed - the human assigns the lane')
  assert.equal(node.zone, 2)
  assert.equal(node.label, 'reconcile GR/IR')
})
