// The keyless scripted demo driver (N1), extracted from App.
//
// A fresh session, then each beat dispatches its events, flies the camera to its zone,
// and (on the challenge beat) draws the evidence line. No model, no key - the launch-gate
// demo is an event-log replay. The hook owns the run token + timer so a stop/restart can
// never leave an older loop driving a swapped store, and it remembers which store the
// demo created so the autosave safety net can decline to overwrite a REAL session's
// autosave with demo content.

import { useEffect, useRef, useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { ChallengeIssuedPayload } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { buildSessionStartedCandidate } from '../session.js'

export interface DemoDeps {
  /** Build a fresh store (App's makeStore). */
  makeStore: () => StoreApi<CanvasStoreState>
  /** Adopt the demo's store as the app's current one (swap + per-session meter reset). */
  adoptStore: (store: StoreApi<CanvasStoreState>) => void
  /** Fly the camera to a zone frame. */
  flyToZone: (zone: number, viewportW: number, viewportH: number) => void
  viewport: () => { w: number; h: number }
  setActiveFrame: (frameId: string) => void
  setLiveChallenge: (challenge: ChallengeIssuedPayload | null) => void
  /** Close overlays a demo supersedes (template picker, briefing). */
  closeOverlays: () => void
  /** Playback finished or was stopped: the session on canvas is now the user's to keep. */
  onPlaybackEnd?: () => void
}

export interface Demo {
  demoCaption: string | null
  runDemo: () => void
  stopDemo: () => void
  /**
   * True for any store the demo CREATED - permanently. Demo-derived sessions are never
   * autosaved: the single autosave slot may hold the only copy of a real session, and
   * demo content must not clobber it. Tinkering after the demo is kept via explicit Save.
   */
  isDemoStore: (store: StoreApi<CanvasStoreState>) => boolean
  /** True only while playback is DRIVING `store` (close-warnings stand down). */
  isDemoDriving: (store: StoreApi<CanvasStoreState>) => boolean
}

export function useDemo(deps: DemoDeps): Demo {
  const [demoCaption, setDemoCaption] = useState<string | null>(null)
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic run token: stopDemo bumps it, so a pending lazy-import or timer from an
  // older run (or a second click) bails instead of driving a swapped store.
  const demoRun = useRef(0)
  const demoStore = useRef<StoreApi<CanvasStoreState> | null>(null)
  // True only while playback is driving dispatches. Once it ends, the session on the
  // canvas is ordinary user state again (autosave and close-warnings resume normally).
  const playing = useRef(false)
  // Deps are read through a ref so runDemo/stopDemo keep a stable identity while always
  // seeing the current camera/viewport. Updated in an effect, never in render.
  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  }, [deps])

  const stopDemo = (): void => {
    demoRun.current += 1
    if (demoTimer.current !== null) clearTimeout(demoTimer.current)
    demoTimer.current = null
    setDemoCaption(null)
    depsRef.current.setLiveChallenge(null)
    if (playing.current) {
      playing.current = false
      depsRef.current.onPlaybackEnd?.()
    }
  }

  const runDemo = (): void => {
    stopDemo()
    const run = demoRun.current
    const d = depsRef.current
    d.closeOverlays()
    const s = d.makeStore()
    const sid = crypto.randomUUID()
    playing.current = true
    s.getState().dispatch(buildSessionStartedCandidate(sid, 'Purchase-to-Pay'))
    demoStore.current = s
    d.adoptStore(s)
    setDemoCaption('Loading the demo…')
    // The demo script (and the template/builder graph it pulls) is lazy-loaded, so it
    // stays out of the initial bundle - it is only needed when a visitor asks to watch.
    // A chunk-load failure (offline mid-visit) must not strand "Loading…" forever.
    void import('./script.js')
      .catch(() => {
        if (demoRun.current === run) stopDemo()
        return null
      })
      .then((m) => {
        if (m === null) return
        const { demoScript } = m
        if (demoRun.current !== run) return // stopped (or restarted) before the import resolved
        const steps = demoScript(sid)
        let i = 0
        const playNext = (): void => {
          if (demoRun.current !== run) return // a newer run/stop supersedes this loop
          const now = depsRef.current
          if (i >= steps.length) {
            setDemoCaption("That's the whole loop - no key needed. Now try it yourself.")
            if (playing.current) {
              playing.current = false
              now.onPlaybackEnd?.()
            }
            demoTimer.current = setTimeout(() => {
              if (demoRun.current === run) setDemoCaption(null)
            }, 6000)
            return
          }
          const step = steps[i]!
          for (const c of step.candidates) s.getState().dispatch(c)
          const { w, h } = now.viewport()
          now.flyToZone(step.zone, w, h)
          now.setActiveFrame(`zone-${step.zone}`)
          if (step.challenge) now.setLiveChallenge(step.challenge)
          setDemoCaption(step.caption)
          i += 1
          demoTimer.current = setTimeout(playNext, 5000)
        }
        playNext()
      })
  }

  // Clear any running timer on unmount so it cannot fire into a torn-down tree.
  useEffect(
    () => () => {
      if (demoTimer.current !== null) clearTimeout(demoTimer.current)
    },
    [],
  )

  return {
    demoCaption,
    runDemo,
    stopDemo,
    isDemoStore: (store) => demoStore.current === store,
    isDemoDriving: (store) => playing.current && demoStore.current === store,
  }
}
