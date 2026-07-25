// Full auto-redraft (Aleks's 2026-07-24 decision, spec amendment 2026-07-24b): with a
// model connected, the business case FOLLOWS its inputs. Whenever anything the agent
// draft reads changes - steps, friction, data/rules profiles, frame figures, the
// assumption ledger, or the opportunity's own title/rung - every committed
// opportunity whose inputs drifted is re-drafted automatically. The draft is born
// PENCIL and C9 upserts it by opportunity_id, so the latest draft supersedes the
// pending one in place (never a stack of stale pencils); the human still accepts or
// edits in the case zone - brake, not steer.
//
// Guard rails, in the same spirit as useAutoDerive:
//  - DEBOUNCE: any canvas change arms one timer; a burst of edits coalesces into a
//    single redraft pass REDRAFT_SETTLE_MS after the last change.
//  - FINGERPRINT: at fire time, an opportunity is re-drafted only when
//    draftInputsFingerprint changed since the last attempt. The fingerprint excludes
//    canvas.cases, so the draft's own dispatch can never re-trigger it (no loop).
//    Failed attempts record the fingerprint too - a broken endpoint is not hammered;
//    the next real input change retries.
//  - BASELINE: on store swap, opportunities that already hold a case adopt their
//    current fingerprint silently - loading a .pnav never triggers a redraft burst.
//    A committed opportunity with NO case yet is drafted on sight (the Express
//    "whole case appears" moment).
//  - PAUSED: the scripted demo drives its own story; nothing fires while it plays.
//
// Bundle note: everything case-specific (model helpers, the draft task and through it
// the prompt pack plumbing) is LAZY-imported inside the debounce callback - this hook
// rides the entry chunk, its machinery must not.

import { useEffect, useRef } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { LlmClient } from '@procezio/core'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { toast } from '../canvas/toast.js'

/** Edits arrive in bursts; one redraft pass covers the burst. */
const REDRAFT_SETTLE_MS = 2500

export function useAutoRedraft(
  store: StoreApi<CanvasStoreState>,
  client: LlmClient | null,
  paused: boolean,
): void {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  // The last fingerprint an auto-draft was ATTEMPTED for, per opportunity id.
  // null = baseline not adopted yet for the current store (first fire seeds it).
  const drafted = useRef<Map<string, string> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const running = useRef(false)

  // A swapped-in store (load, demo, new session) drops the old baseline; the next
  // pass re-seeds it from the swapped-in canvas before acting.
  useEffect(() => {
    drafted.current = null
  }, [store])

  useEffect(() => {
    if (paused || client === null || sessionId === null) return
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      if (running.current) return // a pass is in flight; the next canvas change re-arms
      running.current = true
      void (async () => {
        // Lazy machinery: cold path, must not ride the entry chunk.
        const [model, draft] = await Promise.all([
          import('./model.js'),
          import('../tasks/draft.js'),
        ])
        // Re-read live state at fire time - the debounce window may span dispatches.
        const live = store.getState()
        const liveCanvas = getCanvas(live)
        const liveSession = live.sessionId
        if (liveSession === null) return
        // First pass for this store: adopt the baseline. Opportunities that already
        // hold a case are treated as current (a load never triggers a burst); ones
        // without a case stay unseeded, so they draft below.
        if (drafted.current === null) {
          const base = new Map<string, string>()
          for (const opp of model.committedOpportunities(liveCanvas)) {
            if (model.savedCaseFor(liveCanvas, opp.id) !== null) {
              base.set(opp.id, model.draftInputsFingerprint(liveCanvas, opp))
            }
          }
          drafted.current = base
        }
        let redrafted = 0
        for (const opp of model.committedOpportunities(liveCanvas)) {
          const fp = model.draftInputsFingerprint(liveCanvas, opp)
          if (drafted.current.get(opp.id) === fp) continue
          drafted.current.set(opp.id, fp) // recorded BEFORE the call: no loop, no hammering
          const cand = await draft.draftCaseCandidate(client, liveSession, {
            opportunityId: opp.id,
            title: opp.title,
            canvas: model.assembleCanvasData(liveCanvas),
          })
          // The session may have been swapped away while the model responded.
          if (cand !== null && store.getState().sessionId === liveSession) {
            store.getState().dispatch(cand)
            redrafted += 1
          }
        }
        if (redrafted > 0) {
          toast(
            `Case ${redrafted === 1 ? 'draft' : 'drafts'} updated from your changed inputs - review in pencil.`,
          )
        }
      })().finally(() => {
        running.current = false
      })
    }, REDRAFT_SETTLE_MS)
  }, [canvas, client, paused, sessionId, store])

  // Unmount: never leave a timer aiming at a dead component.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )
}
