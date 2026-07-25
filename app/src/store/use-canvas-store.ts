// M2-01 - the thin React binding for the canvas store.
//
// Kept in its own file ON PURPOSE: the vanilla core (canvas-store.ts) imports
// neither React nor zustand/react, so `node --test` can load and exercise it
// directly. This file is the ONLY place React enters the store surface, and it
// is never imported by the node test - so the vanilla store stays node-testable.
//
// It is a one-line adapter over zustand's own useStore: pass the vanilla store
// created by createCanvasStore plus a selector (getCanvas / getError, or any
// pure selector over CanvasStoreState) and get a re-rendering React binding.

import { useStore } from 'zustand/react'
import type { StoreApi } from 'zustand/vanilla'
import type { CanvasStoreState } from './canvas-store.js'

/**
 * Subscribe a React component to a slice of the canvas store. `store` is the
 * vanilla StoreApi from createCanvasStore; `selector` picks the slice to render
 * (e.g. getCanvas or getError). Re-renders only when the selected slice changes,
 * per zustand's own equality check.
 */
export function useCanvasStore<U>(
  store: StoreApi<CanvasStoreState>,
  selector: (state: CanvasStoreState) => U,
): U {
  return useStore(store, selector)
}
