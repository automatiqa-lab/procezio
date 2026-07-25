// M2-15 - storage adapters for .pnav session files.
//
// The Solo storage seam (specs/02b): "local file first, then OneDrive/SharePoint,
// Google Drive". Every backend implements the same tiny StorageAdapter, so the app's
// save/open flow never knows WHERE a session lives - the local-file adapter here is the
// first implementation; a hosted-drive adapter slots in behind the same interface with
// no change to the persistence UI.
//
// This module touches browser file APIs (download anchor, file input), so it is thin
// and not headless-tested - the FORMAT it moves (pnav.ts) is where the logic and the
// tests live. No network egress: a local file never leaves the machine.

import { downloadBlob } from '../export/download.js'

/** A place a .pnav can be saved to and loaded from. One method each, both async. */
export interface StorageAdapter {
  /** Stable id (e.g. 'local-file'). */
  id: string
  /** Human label for a picker ('This device'). */
  label: string
  /** Persist `content` under `filename`. Rejects/does nothing if the user cancels. */
  save(filename: string, content: string): Promise<void>
  /** Load a file's { name, content }, or null if the user cancels. */
  load(): Promise<{ name: string; content: string } | null>
  /**
   * True when a resolved save() does NOT prove bytes reached disk. The download-anchor
   * adapter cannot observe a cancelled Save-As dialog or a blocked download, so callers
   * must not clear dirty-state or disarm close-warnings on its word alone.
   */
  unconfirmedSave?: boolean
}

/** The .pnav MIME-ish type + extension used across adapters. */
export const PNAV_EXTENSION = '.pnav'

/**
 * The local-device adapter: save via a download anchor, load via a hidden file input.
 * Portable across browsers (no File System Access API dependency), so the static-hosted
 * demo works everywhere. A desktop wrap can later swap in a real filesystem adapter.
 */
export function createLocalFileAdapter(): StorageAdapter {
  return {
    id: 'local-file',
    label: 'This device',
    unconfirmedSave: true,

    save(filename, content) {
      downloadBlob(
        filename.endsWith(PNAV_EXTENSION) ? filename : `${filename}${PNAV_EXTENSION}`,
        new Blob([content], { type: 'application/json' }),
      )
      // Synchronous work, wrapped to satisfy the async StorageAdapter contract.
      return Promise.resolve()
    },

    load() {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = PNAV_EXTENSION + ',application/json'
        input.style.display = 'none'
        let settled = false
        let cancelTimer: ReturnType<typeof setTimeout> | null = null
        const finish = (value: { name: string; content: string } | null): void => {
          if (settled) return
          settled = true
          if (cancelTimer !== null) clearTimeout(cancelTimer)
          window.removeEventListener('focus', onFocus)
          input.remove()
          resolve(value)
        }
        // A dismissed dialog fires no change event in most browsers. The focus fallback
        // catches it: when the window regains focus (the dialog closed), wait a grace
        // period for a change event that may still be racing in, then treat the silence
        // as a cancel - otherwise the promise (and the caller's await) hangs forever and
        // each attempt leaks a hidden input into the body.
        const onFocus = (): void => {
          cancelTimer = setTimeout(() => finish(null), 1000)
        }
        input.addEventListener('change', () => {
          // A file was chosen: the cancel fallback must stand down even if reading the
          // file takes longer than its grace period.
          if (cancelTimer !== null) clearTimeout(cancelTimer)
          window.removeEventListener('focus', onFocus)
          const file = input.files?.[0]
          if (file === undefined) {
            finish(null)
            return
          }
          const reader = new FileReader()
          // readAsText always yields a string; guard the union explicitly (never an ArrayBuffer).
          reader.onload = () =>
            finish({
              name: file.name,
              content: typeof reader.result === 'string' ? reader.result : '',
            })
          reader.onerror = () => finish(null)
          reader.readAsText(file)
        })
        window.addEventListener('focus', onFocus, { once: true })
        document.body.appendChild(input)
        input.click()
      })
    },
  }
}

// --- File System Access adapter (real files, Chromium) ------------------------

/** The subset of the File System Access API this adapter uses (typed locally). */
interface FsPickerWindow {
  showSaveFilePicker?: (opts?: unknown) => Promise<FsFileHandle>
  showOpenFilePicker?: (opts?: unknown) => Promise<FsFileHandle[]>
}
interface FsFileHandle {
  name: string
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  getFile(): Promise<{ text(): Promise<string> }>
}

/** True when the browser supports the File System Access API (real save/open dialogs). */
export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as FsPickerWindow).showSaveFilePicker === 'function'
  )
}

/**
 * The File System Access adapter: a real Save dialog that writes to a genuine file the
 * user picks (and can overwrite in place next time), and a real Open dialog. A better
 * local backend than download/upload where the browser supports it (Chromium). Falls
 * back is the caller's job (see bestLocalAdapter).
 */
export function createFileSystemAdapter(): StorageAdapter {
  const w = window as unknown as FsPickerWindow
  const pickerOpts = {
    types: [{ description: 'Procezio session', accept: { 'application/json': [PNAV_EXTENSION] } }],
  }
  return {
    id: 'file-system',
    label: 'A file on this device',
    async save(filename, content) {
      const handle = await w.showSaveFilePicker!({
        suggestedName: filename.endsWith(PNAV_EXTENSION)
          ? filename
          : `${filename}${PNAV_EXTENSION}`,
        ...pickerOpts,
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
    },
    async load() {
      // A user cancel makes showOpenFilePicker reject (AbortError). The adapter contract
      // says cancel = null, so callers never paint an error over a change of mind.
      let handles: FsFileHandle[]
      try {
        handles = await w.showOpenFilePicker!({ ...pickerOpts, multiple: false })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return null
        throw e
      }
      const handle = handles[0]
      if (handle === undefined) return null
      const file = await handle.getFile()
      return { name: handle.name, content: await file.text() }
    },
  }
}

/** The best local adapter the current browser supports: real files if possible. */
export function bestLocalAdapter(): StorageAdapter {
  return supportsFileSystemAccess() ? createFileSystemAdapter() : createLocalFileAdapter()
}

// --- Microsoft Graph adapter (OneDrive / SharePoint) --------------------------

/** Injected token source + fetch, so the adapter is pure of the OAuth flow and testable. */
export interface GraphAdapterConfig {
  /** Returns a valid Graph access token. The OAuth flow (MSAL/PKCE) is the caller's. */
  getToken: () => Promise<string>
  /** App folder under the drive root, e.g. "Apps/Procezio". */
  folder?: string
  /** Graph base URL (default https://graph.microsoft.com/v1.0). */
  base?: string
  /** Injected fetch (default global). Tests pass a fake. */
  fetchImpl?: typeof fetch
}

interface GraphChild {
  name: string
  lastModifiedDateTime?: string
  '@microsoft.graph.downloadUrl'?: string
}

/**
 * The Microsoft Graph adapter for OneDrive and SharePoint. Save PUTs the .pnav to the
 * app folder; load lists that folder, picks the most recently modified .pnav, and fetches
 * its content. The OAuth token is INJECTED (like the LLM client's transport) - so this
 * adapter carries no login logic, no secret, and is unit-testable with a fake fetch. The
 * deployer supplies getToken via their registered app; egress goes only to Graph (which
 * the CSP connect-src must allow for live use).
 */
export function createGraphAdapter(config: GraphAdapterConfig): StorageAdapter {
  const base = (config.base ?? 'https://graph.microsoft.com/v1.0').replace(/\/+$/, '')
  const folder = (config.folder ?? 'Apps/Procezio').replace(/^\/+|\/+$/g, '')
  const doFetch = config.fetchImpl ?? fetch
  const auth = async (): Promise<Record<string, string>> => ({
    authorization: `Bearer ${await config.getToken()}`,
  })

  return {
    id: 'onedrive',
    label: 'OneDrive / SharePoint',
    async save(filename, content) {
      const name = filename.endsWith(PNAV_EXTENSION) ? filename : `${filename}${PNAV_EXTENSION}`
      const url = `${base}/me/drive/root:/${folder}/${encodeURIComponent(name)}:/content`
      const res = await doFetch(url, {
        method: 'PUT',
        headers: { ...(await auth()), 'content-type': 'application/json' },
        body: content,
      })
      if (!res.ok) throw new Error(`OneDrive save failed (${res.status})`)
    },
    async load() {
      const listUrl = `${base}/me/drive/root:/${folder}:/children`
      const res = await doFetch(listUrl, { headers: await auth() })
      if (!res.ok) throw new Error(`OneDrive list failed (${res.status})`)
      const data = (await res.json()) as { value?: GraphChild[] }
      const pnavs = (data.value ?? []).filter((c) => c.name.endsWith(PNAV_EXTENSION))
      if (pnavs.length === 0) return null
      // Most recently modified wins (string ISO dates sort correctly).
      pnavs.sort((a, b) =>
        (b.lastModifiedDateTime ?? '').localeCompare(a.lastModifiedDateTime ?? ''),
      )
      const chosen = pnavs[0]!
      const contentUrl =
        chosen['@microsoft.graph.downloadUrl'] ??
        `${base}/me/drive/root:/${folder}/${encodeURIComponent(chosen.name)}:/content`
      const contentRes = await doFetch(contentUrl, {
        headers: chosen['@microsoft.graph.downloadUrl'] ? {} : await auth(),
      })
      if (!contentRes.ok) throw new Error(`OneDrive read failed (${contentRes.status})`)
      return { name: chosen.name, content: await contentRes.text() }
    },
  }
}
