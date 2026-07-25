// Autosave acceptance test - the localStorage safety net under the explicit save.
//
// Named criterion: "writeAutosave persists a real session log to the injected store and
// readAutosave restores it through full .pnav validation; a trivial session is not
// saved, corrupt content is cleared rather than re-offered, and a throwing backend
// (private mode / quota) never breaks the caller."
//
// Imports ONLY pure modules - never a .tsx or React - so it runs headless. The storage
// backend is a Map-backed stub of the injected KeyValueStore seam.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUTOSAVE_KEY, clearAutosave, readAutosave, writeAutosave } from './autosave.js'
import type { KeyValueStore } from './autosave.js'
import { createCanvasStore } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'
import { buildNodeCreatedCandidate } from '../map/events.js'
import type { Node } from '@procezio/schema'

const SESSION_ID = '6a4f0c3b-2d5e-4f70-9b2c-3d4e5f60718b'

function makeIdProvider(): () => string {
  let n = 0
  return () => {
    n += 1
    return `30000001-0000-4000-8000-${String(n).padStart(12, '0')}`
  }
}

/** A Map-backed stub of the injected localStorage seam. */
function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

/** A real store with a session and one mapped node - the smallest log worth saving. */
function seededLog() {
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: (() => {
      let n = 0
      return () => {
        n += 1
        return `2026-07-19T09:${String(n).padStart(2, '0')}:00Z`
      }
    })(),
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Order-to-Cash'))
  const node: Node = { id: 'n-invoice', type: 'Step', lane: 'ar', label: 'Invoice', zone: 2 }
  store.getState().dispatch(buildNodeCreatedCandidate(SESSION_ID, node))
  return store.getState().exportLog()
}

test('writeAutosave then readAutosave round-trips a session log through full validation', () => {
  const storage = memoryStore()
  const log = seededLog()
  assert.equal(writeAutosave(storage, SESSION_ID, log), true, 'a real session is written')

  const restored = readAutosave(storage)
  assert.ok(restored !== null && restored.ok, 'the autosave restores as a valid .pnav')
  if (restored === null || !restored.ok) return
  assert.equal(restored.sessionId, SESSION_ID, 'the session id round-trips')
  assert.equal(restored.events.length, log.length, 'every event round-trips')
})

test('a trivial session (session.started only) is not autosaved', () => {
  const storage = memoryStore()
  const store = createCanvasStore({
    eventIdProvider: makeIdProvider(),
    tsProvider: () => '2026-07-19T09:00:00Z',
  })
  store.getState().dispatch(buildSessionStartedCandidate(SESSION_ID, 'Untitled process'))
  const saved = writeAutosave(storage, SESSION_ID, store.getState().exportLog())
  assert.equal(saved, false, 'nothing worth protecting yet')
  assert.equal(storage.map.size, 0, 'the slot stays empty')
})

test('corrupt autosave content is cleared, not re-offered', () => {
  const storage = memoryStore()
  storage.setItem(AUTOSAVE_KEY, '{ not valid json')
  assert.equal(readAutosave(storage), null, 'corrupt content restores nothing')
  assert.equal(storage.map.has(AUTOSAVE_KEY), false, 'the corrupt slot is dropped')
})

test('a throwing storage backend (quota / private mode) never breaks the caller', () => {
  const throwing: KeyValueStore = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: () => {
      throw new Error('denied')
    },
  }
  assert.equal(writeAutosave(throwing, SESSION_ID, seededLog()), false, 'write is best-effort')
  assert.equal(readAutosave(throwing), null, 'read is best-effort')
  assert.doesNotThrow(() => clearAutosave(throwing), 'clear is best-effort')
})

test('clearAutosave drops the slot', () => {
  const storage = memoryStore()
  writeAutosave(storage, SESSION_ID, seededLog())
  clearAutosave(storage)
  assert.equal(readAutosave(storage), null, 'nothing to restore after clear')
})
