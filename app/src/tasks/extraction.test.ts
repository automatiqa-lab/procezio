// C-TASK acceptance test - the Auditor's Shoebox extraction over a stub client.
//
// Named criterion: "runExtraction returns trimmed chips on valid output (dropping blank text and
// blank suggests) and null on failure/invalid; nothing reaches the map - chips are pencil the
// human accepts." Deterministic (stub client, no network); live extraction is the user's to run.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runExtraction } from './extraction.js'
import type { LlmClient } from '@procezio/core'

const metering = { model: 'stub', prompt_chars: 0, completion_chars: 0, attempts: 1, repairs: 0 }
function stub(value: unknown, ok = true): LlmClient {
  return {
    complete: async () => ({ text: '', metering }),
    requestJson: async () =>
      ok
        ? { ok: true as const, value: value as never, metering }
        : { ok: false as const, error: 'x', metering },
    probe: async () => ({ tier: 'T2' as const, reachable: true }),
  }
}

const ITEM = 'Month-end we reconcile the GR/IR account by hand in a spreadsheet.'
const CANVAS = 'zone 2: raise requisition; three-way match'

test('runExtraction returns trimmed chips from a valid list', async () => {
  const out = await runExtraction(
    stub({
      chips: [
        {
          text: '  reconcile GR/IR account  ',
          suggests: '  add a month-end reconciliation step  ',
        },
        { text: 'manual spreadsheet is a data source' },
      ],
    }),
    ITEM,
    CANVAS,
  )
  assert.deepEqual(
    out,
    [
      { text: 'reconcile GR/IR account', suggests: 'add a month-end reconciliation step' },
      { text: 'manual spreadsheet is a data source' },
    ],
    'text and suggests are trimmed; a chip with no suggests keeps none',
  )
})

test('runExtraction returns an empty list when the item implies nothing new', async () => {
  const out = await runExtraction(stub({ chips: [] }), ITEM, CANVAS)
  assert.deepEqual(out, [], 'an empty list is a valid, distinct-from-null result')
})

test('runExtraction returns null on a failed call or invalid output', async () => {
  assert.equal(await runExtraction(stub(null, false), ITEM, CANVAS), null, 'a failed call -> null')
  assert.equal(
    await runExtraction(stub({ chips: [{ text: '   ' }] }, false), ITEM, CANVAS),
    null,
    'blank chip text -> invalid -> null',
  )
  assert.equal(
    await runExtraction(stub({ notChips: [] }, false), ITEM, CANVAS),
    null,
    'wrong shape -> null',
  )
})
