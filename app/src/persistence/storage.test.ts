// M2-18 acceptance test - the Microsoft Graph (OneDrive/SharePoint) storage adapter.
//
// Named criterion: "createGraphAdapter saves a .pnav by PUT to the app folder with a
// Bearer token, and loads by listing the folder, picking the most recently modified
// .pnav, and fetching its content - all over an INJECTED fetch (no network), with the
// OAuth token injected too."
//
// The adapter carries no login logic (getToken + fetch are injected, like the LLM client's
// transport), so it is fully deterministic under node --test. The File System Access and
// download adapters are thin browser-API wrappers, proved by the screenshot criterion.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGraphAdapter, PNAV_EXTENSION } from './storage.js'

/** A fake fetch that records calls and returns scripted responses by URL substring. */
function fakeFetch(
  routes: Array<{ match: string; status?: number; json?: unknown; text?: string }>,
) {
  const calls: Array<{
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }> = []
  const impl = (async (
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => {
    const url = String(input)
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      ...(init?.body !== undefined ? { body: init.body } : {}),
    })
    const route = routes.find((r) => url.includes(r.match))
    const status = route?.status ?? (route ? 200 : 404)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => route?.json ?? {},
      text: async () => route?.text ?? '',
    }
  }) as unknown as typeof fetch
  return { impl, calls }
}

const token = async (): Promise<string> => 'TEST-TOKEN'

test('createGraphAdapter.save PUTs the .pnav to the app folder with a Bearer token', async () => {
  const { impl, calls } = fakeFetch([{ match: ':/content', status: 201 }])
  const adapter = createGraphAdapter({ getToken: token, folder: 'Apps/Procezio', fetchImpl: impl })
  await adapter.save('my-session', '{"format":"pnav"}')

  assert.equal(calls.length, 1, 'one PUT')
  assert.equal(calls[0]?.method, 'PUT', 'save uses PUT')
  assert.match(
    calls[0]!.url,
    /Apps\/Procezio\/my-session\.pnav:\/content$/,
    'targets the app folder path with the .pnav name',
  )
  assert.equal(
    calls[0]?.headers.authorization,
    'Bearer TEST-TOKEN',
    'carries the injected Bearer token',
  )
  assert.equal(calls[0]?.body, '{"format":"pnav"}', 'sends the content as the body')
})

test('createGraphAdapter.load lists the folder, picks the newest .pnav, and fetches it', async () => {
  const children = {
    value: [
      {
        name: 'old.pnav',
        lastModifiedDateTime: '2026-01-01T00:00:00Z',
        '@microsoft.graph.downloadUrl': 'https://dl/old',
      },
      {
        name: 'new.pnav',
        lastModifiedDateTime: '2026-07-01T00:00:00Z',
        '@microsoft.graph.downloadUrl': 'https://dl/new',
      },
      { name: 'notes.txt', lastModifiedDateTime: '2026-08-01T00:00:00Z' },
    ],
  }
  const { impl, calls } = fakeFetch([
    { match: ':/children', json: children },
    { match: 'https://dl/new', text: '{"format":"pnav","from":"new"}' },
  ])
  const adapter = createGraphAdapter({ getToken: token, fetchImpl: impl })
  const loaded = await adapter.load()

  assert.ok(loaded, 'a file is loaded')
  assert.equal(
    loaded?.name,
    'new.pnav',
    'the most recently modified .pnav is chosen (not the .txt, not the old one)',
  )
  assert.equal(loaded?.content, '{"format":"pnav","from":"new"}', 'its content is fetched')
  assert.ok(
    calls.some((c) => c.url.includes(':/children')),
    'the folder was listed',
  )
})

test('createGraphAdapter.load returns null when the folder has no .pnav', async () => {
  const { impl } = fakeFetch([{ match: ':/children', json: { value: [{ name: 'readme.txt' }] } }])
  const adapter = createGraphAdapter({ getToken: token, fetchImpl: impl })
  assert.equal(await adapter.load(), null, 'no .pnav -> null')
})

test('createGraphAdapter throws on a non-2xx save (so the caller surfaces it)', async () => {
  const { impl } = fakeFetch([{ match: ':/content', status: 403 }])
  const adapter = createGraphAdapter({ getToken: token, fetchImpl: impl })
  await assert.rejects(
    () => adapter.save('x', 'y'),
    /OneDrive save failed \(403\)/,
    'a failed save rejects',
  )
})

test('the .pnav extension is shared across adapters', () => {
  assert.equal(PNAV_EXTENSION, '.pnav')
})
