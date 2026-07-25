// M2-15 - the Save / Open session bar.
//
// Wires the .pnav format (pnav.ts) to a storage adapter (storage.ts) and the store.
// Save serializes the current session's event log and hands it to the adapter; Open
// loads a file, parses + fully validates it, and asks the app to reconstruct the store
// from the restored events. A bad file surfaces a message and changes nothing.
//
// Layering: this bar moves bytes; it makes no canvas judgement. The store re-validates
// and re-provenances every loaded event on replay, so an untrusted .pnav cannot forge
// state.

import { useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { EventEnvelope } from '@procezio/core'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { theme } from '../theme.js'
import { serializePnav, parsePnav } from './pnav.js'
import { extractSessionFromPng } from '../export/embed.js'
import { bestLocalAdapter, type StorageAdapter } from './storage.js'
import { hasUnsavedWork } from './autosave.js'
import { filenameSlug } from '../export/download.js'
import { useT } from '../i18n/i18n.js'

export interface SessionBarProps {
  store: StoreApi<CanvasStoreState>
  /** Reconstruct the app's store from a loaded log (App swaps the store instance). */
  onLoad: (events: EventEnvelope[]) => void
  /** Optional adapter override (defaults to the local-device adapter). */
  adapter?: StorageAdapter
}

export function SessionBar({ store, onLoad, adapter }: SessionBarProps): JSX.Element {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  // Dirty tracking: the log length is a primitive, so this selector re-renders only
  // when an event is actually appended.
  const eventCount = useCanvasStore(store, (s) => s.exportLog().length)
  // The saved watermark lives on the STORE (per session), so it swaps with the session
  // and this bar needs no parallel bookkeeping threaded down from App.
  const savedUpTo = useCanvasStore(store, (s) => s.savedUpTo)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const io = adapter ?? bestLocalAdapter()
  const t = useT()
  // Dirty = user work beyond what the last explicit save/load covered (shared predicate
  // with the beforeunload warning, so the indicator and the warning never disagree).
  const dirty = hasUnsavedWork(eventCount, savedUpTo)

  const save = async (): Promise<void> => {
    const events = store.getState().exportLog()
    if (sessionId === null || events.length === 0) {
      setStatus({ kind: 'err', text: 'Nothing to save yet.' })
      return
    }
    try {
      // One shared slugifier with the export filenames (export/download.ts), so a saved
      // session and its exported one-pager get identically shaped names.
      await io.save(filenameSlug(canvas.process.name, 'session'), serializePnav(sessionId, events))
      if (io.unconfirmedSave === true) {
        // A download anchor cannot see a cancelled Save-As dialog, so a resolved save
        // proves nothing: keep the dirty indicator and the close-warning armed, and say
        // exactly what is known. Claiming "Saved" here once disarmed the warnings on a
        // save that never happened.
        setStatus({
          kind: 'ok',
          text: `Download started (${events.length} events). If you kept the file, this session is saved.`,
        })
      } else {
        store.getState().markSaved(events.length)
        setStatus({ kind: 'ok', text: `Saved ${events.length} events.` })
      }
    } catch {
      setStatus({ kind: 'err', text: 'Save was cancelled or failed.' })
    }
  }

  const open = async (): Promise<void> => {
    let file: { name: string; content: string } | null
    try {
      file = await io.load()
    } catch {
      setStatus({ kind: 'err', text: 'Could not open the file.' })
      return
    }
    if (file === null) return // cancelled
    const parsed = parsePnav(file.content)
    if (!parsed.ok) {
      setStatus({ kind: 'err', text: parsed.error })
      return
    }
    onLoad(parsed.events)
    setStatus({ kind: 'ok', text: `Loaded ${parsed.events.length} events from ${file.name}.` })
  }

  // Open a one-pager PNG that carries an embedded session (H3): read the image bytes, recover the
  // .pnav appended after the PNG, and load it. A plain PNG (no session) is reported, not crashed.
  const openPng = async (fileList: FileList | null): Promise<void> => {
    const f = fileList?.[0]
    if (!f) return
    // The read sits inside the try, like the .pnav compare path: a file that vanishes or
    // becomes unreadable between pick and read must surface calmly, never reject unhandled.
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await f.arrayBuffer())
    } catch {
      setStatus({ kind: 'err', text: 'Could not read that file.' })
      return
    }
    const text = extractSessionFromPng(bytes)
    if (text === null) {
      setStatus({ kind: 'err', text: 'That PNG has no embedded session.' })
      return
    }
    const parsed = parsePnav(text)
    if (!parsed.ok) {
      setStatus({ kind: 'err', text: parsed.error })
      return
    }
    onLoad(parsed.events)
    setStatus({ kind: 'ok', text: `Loaded ${parsed.events.length} events from ${f.name}.` })
  }

  const btn: React.CSSProperties = {
    flex: 1,
    cursor: 'pointer',
    border: `1px solid ${theme.border}`,
    borderRadius: 7,
    padding: '7px 10px',
    fontSize: 12,
    fontWeight: 700,
    color: theme.text,
    background: '#ffffff',
  }

  return (
    <div style={{ padding: '10px 14px 0' }}>
      {/* New process (Aleks 2026-07-24): a fresh workspace in a NEW TAB, so the current
          session keeps running untouched. ?new=1 tells the fresh tab to start truly
          blank - it must not offer to restore THIS tab's autosave. noopener: the new
          tab gets no handle back into this one. */}
      <button
        type="button"
        onClick={() => window.open('?new=1', '_blank', 'noopener')}
        aria-label="New process in a new window"
        title="Open a fresh canvas in a new browser tab - this session stays as it is"
        style={{
          ...btn,
          width: '100%',
          marginBottom: 6,
          borderStyle: 'dashed',
          color: theme.accent,
          borderColor: theme.accent,
        }}
      >
        {t('session.new')}
      </button>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => void save()}
          aria-label="Save session"
          title="Save this session as a .pnav file"
          style={btn}
        >
          {t('session.save')}
        </button>
        <button
          type="button"
          onClick={() => void open()}
          aria-label="Open session"
          title="Open a .pnav session file"
          style={btn}
        >
          {t('session.open')}
        </button>
        <label
          title="Open a one-pager PNG that carries an embedded session (H3)"
          style={{ ...btn, textAlign: 'center' }}
        >
          {t('session.png')}
          <input
            type="file"
            accept="image/png"
            style={{ display: 'none' }}
            onChange={(e) => {
              void openPng(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {/* Dirty state: a no-code user must never have to wonder "did I save?". Shown only
          while unsaved work exists - the explicit save's own status line confirms success. */}
      {dirty ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: theme.pencil,
          }}
        >
          <span aria-hidden="true">●</span>
          {t('session.unsaved')}
        </div>
      ) : null}
      {status !== null ? (
        <div
          role="status"
          style={{
            marginTop: 6,
            fontSize: 11,
            lineHeight: 1.4,
            color: status.kind === 'err' ? theme.friction : theme.pass,
          }}
        >
          {status.text}
        </div>
      ) : null}
    </div>
  )
}
