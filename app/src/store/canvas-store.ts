// M2-01 - the Zustand event-reducer store for @procezio/app.
//
// This is the canvas mirror the frontend reads (specs/02 s.8: "Zustand store =
// event reducer mirror"; specs/02b keeps Zustand in the amendment's BOM). It is
// a PURE, DETERMINISTIC projection of the core event log and owns exactly one
// invariant: it is the ONLY code path that mutates canvas state, and it does so
// only by re-projecting the log after the core event store accepts an event.
//
// Layering (constitution / AGENTS.md): this store makes NO generative judgement
// about whether an event is good. The deterministic ajv validation inside the
// core event store (C8) decides acceptance; C9 project() decides the canvas.
// This module only wires the two and holds the latest projection.
//
// Isomorphic / node-testable by construction: this file imports nothing from
// node:*, never reads the wall clock or randomness, and generates no ids or
// timestamps of its own. Every event_id/ts either arrives on the candidate or
// comes from an INJECTED provider - so the identical vanilla store runs under
// `node --test` (see canvas-store.test.ts) exactly as it runs in the browser.
// The React binding lives in a separate file (use-canvas-store.ts) so importing
// this core never drags React in.

import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'
// C8 event store + C9 projection are the sole authorities on validity/ordering
// and on canvas state respectively; this store composes them and redefines
// neither. EventCandidate / AppendResult come from the core's public surface;
// Canvas comes from the ratified schema. Nothing here is a local redefinition of a
// shared type. The event store validates with a precompiled contract baked in at
// build time (M2-01a), so no schema is threaded through this store anymore.
import {
  createEventStore,
  project,
  evaluate,
  createCompensatingEvent,
  provenanceOf,
} from '@procezio/core'
import type { EventCandidate, AppendResult, EventEnvelope, Ruleset } from '@procezio/core'
import type { Canvas, Provenance } from '@procezio/schema'
import { deletionTargetsFor, nextRedoTarget, nextUndoTarget } from '../history/undo.js'
import { buildFlagCandidate, pendingPencil, type PencilItem } from '../provenance/pencil.js'
import {
  BUDGET_PER_CLASS,
  activeCountForClass,
  computeActiveNudges,
  hasFired,
  meetsTier,
  type Nudge,
} from '../rules/nudges.js'

/**
 * The ajv validation errors carried by a rejected append. Derived from the core's
 * own AppendResult union rather than importing ajv's ErrorObject directly, so
 * zustand stays the ONLY new runtime dependency of @procezio/app and the error
 * shape cannot drift from what the event store actually returns.
 */
export type ValidationErrors = Extract<AppendResult, { ok: false }>['errors']

/**
 * What a caller hands to dispatch(): a full EventCandidate MINUS event_id and ts,
 * either of which the caller MAY still supply. When absent, dispatch resolves
 * them from the injected providers. This is what makes "ids and timestamps come
 * from injected providers or the caller, never generated within the store" a
 * literal property of the type, not a convention.
 */
export type DispatchCandidate = Omit<EventCandidate, 'event_id' | 'ts'> & {
  event_id?: string
  ts?: string
}

/** The observable state of the canvas store. dispatch is the sole mutator. */
export interface CanvasStoreState {
  /** The session whose projection `canvas` currently reflects (null until first accept). */
  sessionId: string | null
  /** The projected canvas (C9 project() over the accepted log). Starts as the empty projection. */
  canvas: Canvas
  /** ajv errors from the most recent rejected dispatch, or null after a successful one. */
  lastError: ValidationErrors | null
  /**
   * The active agent nudges (M2-13): rule.fired firings the C12 engine produced for
   * this session, deduped and minus dismissed ones. Empty when no ruleset is wired.
   */
  nudges: Nudge[]
  /** Whether an undo is available (a reversible, currently-applied event exists). */
  canUndo: boolean
  /** Whether a redo is available (a currently-undone event exists). */
  canRedo: boolean
  /** Build a full EventCandidate, append it via the core store, and re-project on success. */
  dispatch: (candidate: DispatchCandidate) => void
  /** Dismiss a nudge by rule id - it never reappears this session (spec: dismissed never repeat). */
  dismissNudge: (ruleId: string) => void
  /** Undo the most recent reversible event by appending a compensating event (C10). */
  undo: () => void
  /** Redo the most recently undone event (compensation-of-a-compensation). */
  redo: () => void
  /**
   * Delete one map element by TARGETED compensation (not a new event family): every
   * applied creation origin of the element is compensated, and a node delete cascades
   * to everything referencing it - connected edges, friction pins, its data/rules
   * profile - so no dangling reference survives for the case to cite. Append-only
   * like undo - the log keeps the full story, and redo restores LIFO (node first).
   */
  removeElement: (kind: 'node' | 'edge', elementId: string) => void
  /** The full accepted event log for the current session (for .pnav export). Empty if no session. */
  exportLog: () => readonly EventEnvelope[]
  /**
   * The current capability tier. T0 until a model is connected; raising it (via the LLM
   * capability probe) lets higher-min_tier rules fire - e.g. the zone-6 challenge (T1).
   */
  tier: string
  /** Raise/lower the capability tier (set from the LLM probe when a model connects). */
  setTier: (tier: string) => void
  /**
   * The saved watermark: how many events the last explicit save/load covered. Lives on
   * the STORE (per session) rather than as app state on purpose - a store swap gets a
   * fresh watermark automatically, so dirty-tracking and the close-warning can never
   * read one session's watermark against another session's log. (An earlier app-level
   * copy was correct only by setter call-ordering across three files.)
   */
  savedUpTo: number
  /** Record an explicit save/load covering the first `count` events. */
  markSaved: (count: number) => void
  /** Pending agent (pencil) contributions awaiting a human accept/reject (M2-16). */
  pencilItems: PencilItem[]
  /** Live two-ink provenance per element key (e.g. "node:x" -> pencil|ink), for styling. */
  provenance: ReadonlyMap<string, Provenance>
  /** Accept a pencil contribution -> ink (flag.accepted/accepted). */
  acceptPencil: (targetEventId: string) => void
  /** Reject a pencil contribution -> removed (flag.accepted/rejected, a compensation). */
  rejectPencil: (targetEventId: string) => void
}

export interface CanvasStoreOptions {
  /** Supplies event_id when the candidate omits it. The store never generates ids itself. */
  eventIdProvider?: () => string
  /** Supplies ts when the candidate omits it. The store never reads a clock itself. */
  tsProvider?: () => string
  /**
   * The versioned ruleset (M2-13). When present, each HUMAN event runs the C12 engine
   * and any fired rules (respecting tier + a per-class budget + a fired-once cooldown)
   * are appended as rule.fired events and surfaced as nudges. Absent = no orchestration
   * (the store behaves exactly as before - existing tests pass a store with no ruleset).
   */
  ruleset?: Ruleset
  /** Current capability tier (default T0, no LLM). Rules with a higher min_tier stay dormant. */
  tier?: string
  /** Author id stamped on rule.fired events. Defaults to 'rules-engine'. */
  agentId?: string
  /**
   * A previously-saved event log to replay on construction (loading a .pnav, M2-15).
   * Each event is re-appended through the event store, so it is re-validated and its
   * provenance is re-derived from author.kind (a file cannot forge human acceptance).
   * Rules are NOT re-run - the log already contains the rule.fired events it produced -
   * so loading reconstructs the exact session without duplicating nudges. Events carry a
   * seq from the file; the store re-assigns seq authoritatively on append.
   */
  initialEvents?: readonly EventEnvelope[]
}

/**
 * Build a vanilla Zustand store that mirrors the core event log as canvas state.
 * One internal C8 event store is created per canvas store; dispatch is the only
 * path that writes canvas state.
 */
export function createCanvasStore(options: CanvasStoreOptions = {}): StoreApi<CanvasStoreState> {
  const { eventIdProvider, tsProvider, ruleset, agentId = 'rules-engine', initialEvents } = options
  // The tier is mutable: setTier raises it when a model connects, so tier-gated rules
  // (e.g. the zone-6 challenge) begin firing on subsequent human events.
  let currentTier = options.tier ?? 'T0'
  const eventStore = createEventStore()
  // Dismissed nudges are UI-only state (ephemeral guidance, not a canvas fact), so
  // they live in this closure rather than the event log - dismissal never changes the
  // projection or replay. A dismissed rule never re-fires this session.
  const dismissed = new Set<string>()

  // Replay a loaded .pnav log (M2-15) BEFORE building the store, so the store's initial
  // state reflects the restored session. Each event is re-appended - re-validated by
  // ajv and re-provenanced from author.kind (forgery-proof) - and the store re-assigns
  // seq. Rules are NOT re-run: the rule.fired events are already in the log, so replay
  // reconstructs the session exactly without duplicating nudges.
  let loadedSessionId: string | null = null
  if (initialEvents !== undefined) {
    for (const event of initialEvents) {
      const result = eventStore.append(event)
      if (result.ok) loadedSessionId = event.session_id
    }
  }

  /**
   * Run the C12 rule engine over the just-applied human event, appending any fired
   * rules (subject to tier, a fired-once cooldown, and a per-class budget) as
   * rule.fired events. Deterministic: evaluate() is pure and every id/ts comes from
   * the same injected providers the store already uses. Returns nothing - the caller
   * recomputes nudges from the log afterwards.
   */
  const runRules = (applied: EventEnvelope): Canvas | null => {
    if (ruleset === undefined || applied.author.kind !== 'human') return null
    // An undo/redo (a compensating event) is not a fresh human action - it reverses
    // one. Running rules on it would fire nudges on undo, which is noise, so skip.
    if (applied.compensates != null) return null
    const log = eventStore.eventsFor(applied.session_id)
    const context = {
      sessionId: applied.session_id,
      correlationId: applied.correlation_id,
      agentId,
      schemaVersion: applied.schema_version,
      ts: tsProvider?.() ?? applied.ts,
      eventId: () => eventIdProvider?.() ?? applied.event_id,
    }
    const projection = project(log)
    const fired = evaluate(ruleset, projection, applied, context)
    for (const candidate of fired) {
      const ruleId = candidate.payload.rule_id
      const rule = ruleset.rules.find((r) => r.id === ruleId)
      // Tier gate: a rule above the current capability tier stays dormant (e.g. the
      // zone-6 challenge waits for the LLM). Cooldown: fire each rule at most once
      // while its firing stands. Dismissed: never re-fire. Budget: <= 2 per class.
      if (!meetsTier(rule?.min_tier, currentTier)) continue
      if (dismissed.has(ruleId)) continue
      if (hasFired(log, ruleId)) continue
      if (
        rule?.budget_class !== undefined &&
        activeCountForClass(log, dismissed, rule.budget_class) >= BUDGET_PER_CLASS
      ) {
        continue
      }
      // The candidate already carries event_id/ts from the context; the store assigns
      // seq on append. rule.fired is inert for projection (C9), so canvas is unchanged.
      eventStore.append(candidate)
    }
    // rule.fired is projection-inert, so the projection computed above is IDENTICAL to
    // what a re-fold after the appends would produce - hand it back so dispatch never
    // folds the same log twice per event.
    return projection
  }

  // Initial state derived from the (possibly loaded) log. With no initialEvents this is
  // the empty projection - identical to the pre-M2-15 behavior.
  const initialLog = loadedSessionId === null ? [] : eventStore.eventsFor(loadedSessionId)
  const initialCanvas = project(initialLog)
  const initialProvenance = provenanceOf(initialLog)
  const initialNudges =
    ruleset === undefined || loadedSessionId === null
      ? []
      : computeActiveNudges(initialLog, ruleset, dismissed)

  return createStore<CanvasStoreState>((set, get) => ({
    sessionId: loadedSessionId,
    // The empty projection - reuse C9's fold of an empty log rather than
    // reinventing an empty-canvas literal here (single source of truth for shape).
    canvas: initialCanvas,
    lastError: null,
    nudges: initialNudges,
    canUndo: nextUndoTarget(initialLog) !== null,
    canRedo: nextRedoTarget(initialLog) !== null,
    tier: currentTier,
    savedUpTo: 0,
    pencilItems: pendingPencil(initialLog, initialProvenance),
    provenance: initialProvenance,
    dispatch: (partial) => {
      // Resolve identity/time from the candidate first, then the injected
      // providers. No wall clock, no randomness, no crypto - the store is a pure
      // function of what it is given.
      const event_id = partial.event_id ?? eventIdProvider?.()
      const ts = partial.ts ?? tsProvider?.()
      // Fail loudly rather than silently fabricating a value: if neither the
      // candidate nor a provider supplies an id/ts, dispatch throws. This is what
      // keeps "never generated within the store" true even at the edges.
      if (event_id === undefined) {
        throw new Error(
          'createCanvasStore.dispatch: no event_id on the candidate and no eventIdProvider configured - ids must be injected, never generated in the store',
        )
      }
      if (ts === undefined) {
        throw new Error(
          'createCanvasStore.dispatch: no ts on the candidate and no tsProvider configured - timestamps must be injected, never generated in the store',
        )
      }

      const candidate: EventCandidate = { ...partial, event_id, ts }
      const result = eventStore.append(candidate)

      if (!result.ok) {
        // Rejected by ajv: canvas and sessionId are left exactly as they were;
        // only lastError is populated with the validation errors.
        set({ lastError: result.errors })
        return
      }

      // Accepted: run the rule engine over the just-applied event (appends any
      // rule.fired events), then re-project this session's full accepted log via C9
      // and adopt the result as the new canvas. rule.fired is inert for projection,
      // so canvas reflects only real canvas facts; nudges are derived separately.
      const sessionId = candidate.session_id
      const applied = eventStore.eventsFor(sessionId).at(-1)
      const preProjected = applied !== undefined ? runRules(applied) : null
      const log = eventStore.eventsFor(sessionId)
      // Reuse the projection runRules already folded (rule.fired never changes it);
      // fold here only when rules were skipped (agent events, undo/redo, no ruleset).
      const canvas = preProjected ?? project(log)
      const nudges = ruleset === undefined ? [] : computeActiveNudges(log, ruleset, dismissed)
      // One provenance fold per dispatch, shared with pendingPencil (which used to fold
      // the same log a second time internally).
      const provenance = provenanceOf(log)
      set({
        sessionId,
        canvas,
        lastError: null,
        nudges,
        canUndo: nextUndoTarget(log) !== null,
        canRedo: nextRedoTarget(log) !== null,
        pencilItems: pendingPencil(log, provenance),
        provenance,
      })
    },
    dismissNudge: (ruleId) => {
      dismissed.add(ruleId)
      const sessionId = get().sessionId
      if (sessionId === null || ruleset === undefined) return
      const nudges = computeActiveNudges(eventStore.eventsFor(sessionId), ruleset, dismissed)
      set({ nudges })
    },
    // Undo/redo both append a compensating event (C10) targeting the current tip of a
    // chain; project() resolves the net effect by chain parity. They route through the
    // public dispatch, so validation, re-projection, nudge and can-undo/redo refresh
    // all happen on the one path. A human-authored compensation is born ink.
    undo: () => {
      const sessionId = get().sessionId
      if (sessionId === null) return
      const target = nextUndoTarget(eventStore.eventsFor(sessionId))
      if (target === null) return
      get().dispatch(compensationFor(target))
    },
    redo: () => {
      const sessionId = get().sessionId
      if (sessionId === null) return
      const target = nextRedoTarget(eventStore.eventsFor(sessionId))
      if (target === null) return
      get().dispatch(compensationFor(target))
    },
    removeElement: (kind, elementId) => {
      const sessionId = get().sessionId
      if (sessionId === null) return
      // Targets are computed ONCE, up front: each is the tip of a distinct chain, and
      // the compensations this loop appends extend only those chains, so no target
      // goes stale mid-loop. Each dispatch runs the full validate -> re-project path.
      const targets = deletionTargetsFor(eventStore.eventsFor(sessionId), kind, elementId)
      for (const target of targets) get().dispatch(compensationFor(target))
    },
    exportLog: () => {
      const sessionId = get().sessionId
      return sessionId === null ? [] : eventStore.eventsFor(sessionId)
    },
    setTier: (tier) => {
      currentTier = tier
      set({ tier })
    },
    markSaved: (count) => {
      set({ savedUpTo: count })
    },
    acceptPencil: (targetEventId) => {
      const sessionId = get().sessionId
      if (sessionId === null) return
      get().dispatch(buildFlagCandidate(sessionId, targetEventId, 'accepted'))
    },
    rejectPencil: (targetEventId) => {
      const sessionId = get().sessionId
      if (sessionId === null) return
      get().dispatch(buildFlagCandidate(sessionId, targetEventId, 'rejected'))
    },
  }))

  /** Mint a human-authored compensating candidate for `target` (ids from providers). */
  function compensationFor(target: EventEnvelope): DispatchCandidate {
    // Resolve the new event's id/ts the same way dispatch does, failing loudly if no
    // provider is configured (never fabricate inside the store).
    const newId = eventIdProvider?.()
    const newTs = tsProvider?.()
    if (newId === undefined) {
      throw new Error(
        'createCanvasStore.undo/redo: no eventIdProvider configured - ids must be injected',
      )
    }
    if (newTs === undefined) {
      throw new Error(
        'createCanvasStore.undo/redo: no tsProvider configured - timestamps must be injected',
      )
    }
    return createCompensatingEvent(target, {
      eventId: newId,
      ts: newTs,
      author: { kind: 'human', id: 'local-user' },
    })
  }
}

/** Selector: the current projected canvas. Composes with useStore(store, getCanvas). */
export const getCanvas = (state: CanvasStoreState): Canvas => state.canvas

/** Selector: the most recent validation errors, or null. Composes with useStore(store, getError). */
export const getError = (state: CanvasStoreState): ValidationErrors | null => state.lastError
