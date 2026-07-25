// The export handler cluster, extracted from App (which had grown into a God-component).
//
// Five user-facing exports plus the re-assessment loader, each lazy-importing its
// renderer so none of them ride in the initial bundle. Pure orchestration: every canvas
// judgement lives in the renderers/core; this hook only sequences import -> render ->
// toast (one shared skeleton - the four sheet handlers differed only in renderer and
// copy). Failures surface as calm toasts, never crashes.

import type { StoreApi } from 'zustand/vanilla'
// pnav and core are STATIC imports on purpose: both already ride in the entry chunk
// (pnav via the session bar + autosave, core via the store), so lazy-importing them
// here would gain nothing and made Vite warn on every build. Only render.js - a real
// separate chunk - stays lazy.
import { project, sessionDiff, reviewSchedule } from '@procezio/core'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { serializePnav, parsePnav } from '../persistence/pnav.js'
import { toast } from '../canvas/toast.js'
import { buildCheckpointExportedCandidate } from './events.js'

type RenderModule = typeof import('./render.js')

/** What compareToPrior yields for the ReassessDiff modal. */
export interface ReassessData {
  diff: import('@procezio/core').SessionDiff
  schedule: import('@procezio/core').ReviewSchedule
  name: string
}

export interface Exports {
  exportCheckpoint: () => void
  exportWalkthrough: () => void
  exportHaccp: () => void
  exportSessionPng: () => void
  /** Load a prior .pnav and diff it against the current canvas (read-only). */
  compareToPrior: (fileList: FileList | null) => Promise<ReassessData | null>
}

export function useExports(
  store: StoreApi<CanvasStoreState>,
  /**
   * The CURRENT store, maintained by App across session swaps. An export that resolves
   * after a swap must not dispatch its follow-up event into this (departed) store -
   * the event would silently vanish from every live log.
   */
  liveStore?: React.RefObject<StoreApi<CanvasStoreState> | null>,
): Exports {
  const isCurrent = (): boolean => liveStore === undefined || liveStore.current === store

  // The shared skeleton: guard the session, lazy-load the renderer, run one export,
  // toast the outcome. Each handler contributes only its renderer call and its copy.
  const runExport = (
    pick: (m: RenderModule) => Promise<string>,
    success: (name: string) => string,
    failure: string,
    after?: (name: string) => void,
  ): void => {
    if (store.getState().sessionId === null) return
    void import('./render.js')
      .then(pick)
      .then((name) => {
        after?.(name)
        toast(success(name))
      })
      .catch(() => toast(failure))
  }

  // The Understand-phase friction-map checkpoint (E5) also logs a checkpoint event -
  // guarded against a session swap during the lazy import + render.
  const exportCheckpoint = (): void => {
    const sessionId = store.getState().sessionId
    if (sessionId === null) return
    runExport(
      (m) =>
        m.exportFrictionMapCheckpoint(getCanvas(store.getState()), store.getState().provenance),
      (name) => `Exported ${name}. A checkpoint - value before the case is done.`,
      'Checkpoint export failed.',
      () => {
        if (isCurrent()) {
          store.getState().dispatch(buildCheckpointExportedCandidate(sessionId, 'friction-map'))
        }
      },
    )
  }

  const exportWalkthrough = (): void =>
    runExport(
      (m) => m.exportWalkthrough(getCanvas(store.getState())),
      (name) => `Exported ${name}. Print it and walk the process with the doer.`,
      'Walk-through export failed.',
    )

  const exportHaccp = (): void =>
    runExport(
      (m) => m.exportHaccp(getCanvas(store.getState())),
      (name) => `Exported ${name}. Complete the control columns with the team.`,
      'HACCP export failed.',
    )

  // The one-pager PNG with the session embedded (H3): sharing the image shares a
  // reopenable session. Needs its own empty-log guard before the shared skeleton.
  const exportSessionPng = (): void => {
    const sessionId = store.getState().sessionId
    const events = store.getState().exportLog()
    if (sessionId === null || events.length === 0) {
      toast('Nothing to export yet.')
      return
    }
    runExport(
      (m) =>
        m.exportOnePagerWithSession(
          getCanvas(store.getState()),
          serializePnav(sessionId, events),
          store.getState().provenance,
        ),
      (name) => `Exported ${name}. Share the image - it reopens the session in Procezio.`,
      'Session-PNG export failed.',
    )
  }

  // Re-assessment diff (G5): read a prior .pnav, project it, diff against the current
  // canvas. Read-only - the current session is untouched. The file read sits inside the
  // try: a corrupt or unreadable file must toast, never reject unhandled.
  const compareToPrior = async (fileList: FileList | null): Promise<ReassessData | null> => {
    const f = fileList?.[0]
    if (!f) return null
    try {
      const text = await f.text()
      const parsed = parsePnav(text)
      if (!parsed.ok) {
        toast(`Could not read that session: ${parsed.error}`)
        return null
      }
      const prior = project(parsed.events)
      const current = getCanvas(store.getState())
      return {
        diff: sessionDiff(prior, current),
        schedule: reviewSchedule(current),
        name: f.name,
      }
    } catch {
      toast('Could not read that file.')
      return null
    }
  }

  return { exportCheckpoint, exportWalkthrough, exportHaccp, exportSessionPng, compareToPrior }
}
