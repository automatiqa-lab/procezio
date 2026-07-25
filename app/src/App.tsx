// v0.4 - the one-canvas Solo app shell (replaces the M2-02 panel switcher).
//
// A single infinite pannable/zoomable surface (spec 01b section 2). The eight methodology
// zones plus the Shoebox live as movable widget frames on the canvas; navigation is camera
// flight, not a screen change. The zone rail shows completeness as named missing items, the top
// bar leads with the honest credibility claim + a live cost meter, and Ctrl/Cmd+K opens the
// command palette. The methodology store, session boundary and LLM wiring are unchanged - only the
// shell around them is rebuilt.
//
// The shell also owns the safety net and the front door: a debounced localStorage autosave
// (with a restore offer on relaunch and a beforeunload guard), and ?demo=1 / ?template=<id>
// deep links plus visible start chips so the keyless demo is findable without knowing ⌘K.
// The export handlers live in export/useExports.ts and the demo driver in demo/useDemo.ts.

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { EventEnvelope, LlmClient } from '@procezio/core'
import { createCanvasStore, getCanvas } from './store/canvas-store.js'
import { useCanvasStore } from './store/use-canvas-store.js'
import { rewordNudge } from './tasks/reword.js'
import { SettingsPanel } from './settings/SettingsPanel.js'
import { SeedBar } from './tasks/SeedBar.js'
import { ChatPanel } from './tasks/ChatPanel.js'
import { PencilReview } from './provenance/PencilReview.js'
import { buildSessionStartedCandidate } from './session.js'
import { ZONES } from './zones.js'
import { theme } from './theme.js'
import { RULESET as ruleset } from './rules/ruleset.generated.js'
import { AssumptionPanel } from './assumptions/AssumptionPanel.js'
import { NudgePanel } from './rules/NudgePanel.js'
import { HistoryBar } from './history/HistoryBar.js'
import { SessionBar } from './persistence/SessionBar.js'
import { Shoebox } from './shoebox/Shoebox.js'
import { CanvasWorld } from './canvas/CanvasWorld.js'
import { WidgetFrame } from './canvas/WidgetFrame.js'
import { ZoneRail } from './canvas/ZoneRail.js'
import { TopBar, type Mode } from './canvas/TopBar.js'
import { CommandPalette, type Command } from './canvas/CommandPalette.js'
import { useCanvasView } from './canvas/useCanvasView.js'
import { Zoomer } from './canvas/Zoomer.js'
import { Minimap } from './canvas/Minimap.js'
import { ExportPopover } from './canvas/ExportPopover.js'
import { ToastHost } from './canvas/ToastHost.js'
import { toast } from './canvas/toast.js'
import { PersonaLegend } from './canvas/PersonaLegend.js'
import { ChallengerCard } from './canvas/ChallengerCard.js'
import { FacilitatorPanel } from './canvas/FacilitatorPanel.js'
import { CommitCeremony } from './ceremony/CommitCeremony.js'
import { buildCommitmentCandidate } from './ceremony/events.js'
import { EvidenceLine } from './canvas/EvidenceLine.js'
import { templateToCandidates, type Template } from './templates/template.js'
import { CostMeter, meteredClient } from './cost/meter.js'
import { reEntryBriefing, type ReEntryBriefing } from './session/briefing.js'
import { BriefingBanner } from './session/BriefingBanner.js'
import { DemoCaption } from './demo/DemoCaption.js'
import type { ChallengeIssuedPayload } from '@procezio/schema'
import { challengeTier, recalcRoute } from '@procezio/core'
import {
  runChallengeIssued,
  buildChallengeIssuedCandidate,
  buildChallengeAnsweredCandidate,
  assembleEvidence,
  citableRefs,
  challengedDimension,
} from './tasks/challenger.js'
import { useExports, type ReassessData } from './export/useExports.js'
import { useDemo } from './demo/useDemo.js'
import { useAutoDerive } from './derive/useAutoDerive.js'
import { useAutoRedraft } from './case/useAutoRedraft.js'
import {
  writeAutosave,
  readAutosave,
  clearAutosave,
  hasUnsavedWork,
} from './persistence/autosave.js'
import { RestoreBanner } from './persistence/RestoreBanner.js'
import { t } from './i18n/i18n.js'

// The zone surfaces are code-split: each stays its own chunk (React Flow rides only in the Map
// chunk), so the whole canvas loads without any single chunk blowing the bundle budget.
const FrameZone = lazy(() => import('./frame/FrameZone.js').then((m) => ({ default: m.FrameZone })))
const MapZone = lazy(() => import('./map/MapZone.js').then((m) => ({ default: m.MapZone })))
const FrictionZone = lazy(() =>
  import('./friction/FrictionZone.js').then((m) => ({ default: m.FrictionZone })),
)
const DataZone = lazy(() => import('./data/DataZone.js').then((m) => ({ default: m.DataZone })))
const IdeationZone = lazy(() =>
  import('./ideation/IdeationZone.js').then((m) => ({ default: m.IdeationZone })),
)
const PrioritizeZone = lazy(() =>
  import('./prioritize/PrioritizeZone.js').then((m) => ({ default: m.PrioritizeZone })),
)
const GateZone = lazy(() => import('./gate/GateZone.js').then((m) => ({ default: m.GateZone })))
const CaseZone = lazy(() => import('./case/CaseZone.js').then((m) => ({ default: m.CaseZone })))
// The template picker (and the template data it lists) is lazy - a modal only shown on request,
// so the six seeded templates stay out of the initial bundle.
const TemplatePicker = lazy(() =>
  import('./templates/TemplatePicker.js').then((m) => ({ default: m.TemplatePicker })),
)
// The replay scrubber (and the core project it re-runs) is lazy - a modal only shown on request.
const ReplayScrubber = lazy(() =>
  import('./history/ReplayScrubber.js').then((m) => ({ default: m.ReplayScrubber })),
)
const ReassessDiff = lazy(() =>
  import('./history/ReassessDiff.js').then((m) => ({ default: m.ReassessDiff })),
)

const DEFAULT_PROCESS_NAME = 'Untitled process'

// Frame id -> zone surface: one data table instead of a switch buried mid-component,
// so adding/renaming a frame is a one-row edit next to the lazy imports above.
type FrameStore = ReturnType<typeof createCanvasStore>
const FRAME_RENDERERS: Record<
  string,
  (store: FrameStore, client: LlmClient | null) => JSX.Element
> = {
  'zone-1': (store, client) => <FrameZone store={store} client={client} />,
  'zone-2': (store, client) => <MapZone store={store} client={client} />,
  'zone-3': (store) => <FrictionZone store={store} />,
  'zone-4': (store) => <DataZone store={store} />,
  'zone-5': (store, client) => <IdeationZone store={store} client={client} />,
  'zone-6': (store, client) => <PrioritizeZone store={store} client={client} />,
  'zone-7': (store) => <GateZone store={store} />,
  'zone-8': (store, client) => <CaseZone store={store} client={client} />,
  shoebox: (store, client) => <Shoebox store={store} client={client} />,
}

function FrameLoading() {
  return (
    <div style={{ padding: 16, fontSize: 13, color: theme.textMuted }} role="status">
      Loading…
    </div>
  )
}

function makeStore(initialEvents?: readonly EventEnvelope[]) {
  return createCanvasStore({
    eventIdProvider: () => crypto.randomUUID(),
    tsProvider: () => new Date().toISOString(),
    ruleset,
    ...(initialEvents !== undefined ? { initialEvents } : {}),
  })
}

export function App() {
  const [store, setStore] = useState(() => makeStore())
  const [briefing, setBriefing] = useState<ReEntryBriefing | null>(null)
  // The autosave restore offer, read once on launch. (count is just events.length -
  // carrying it separately only created the possibility of divergence.)
  const [restoreOffer, setRestoreOffer] = useState<EventEnvelope[] | null>(null)

  // The capability tier belongs to the CONNECTION (the probed client survives a session
  // change), but each fresh store boots at T0 - without this carry-over, loading a .pnav
  // silently muted the Challenger and read "Model · off" while paid calls continued.
  // Bumping swapRun also invalidates any in-flight Challenger wording call: its reply
  // belongs to the departed session and must not surface a card (or events) in this one.
  const swapRun = useRef(0)
  const adoptNewStore = (s: ReturnType<typeof makeStore>): void => {
    swapRun.current += 1
    s.getState().setTier(store.getState().tier)
    setStore(s)
    setLiveChallenge(null)
    setChallengerThinking(false)
    costMeter.current.reset() // the meter is per-session; a new session starts at zero
  }

  const loadSession = (events: EventEnvelope[]): void => {
    demo.stopDemo() // a loaded session takes over; do not let a demo timer drive it
    const s = makeStore(events)
    s.getState().markSaved(events.length) // freshly loaded = everything is on file
    adoptNewStore(s)
    setRestoreOffer(null)
    // Re-entry briefing: a loaded session with content gets the Facilitator's where-you-left-off.
    const b = reEntryBriefing(getCanvas(s.getState()))
    setBriefing(b.hasContent ? b : null)
  }

  // Start a fresh session seeded from a template: a new store, a session, then the template's
  // Understand-side content events. Diverge/Converge stay empty (the template carries none).
  const startFromTemplate = (tpl: Template): void => {
    demo.stopDemo() // a fresh template session takes over from any running demo
    const s = makeStore()
    const sid = crypto.randomUUID()
    s.getState().dispatch(buildSessionStartedCandidate(sid, tpl.frame.name ?? DEFAULT_PROCESS_NAME))
    for (const c of templateToCandidates(tpl, sid)) s.getState().dispatch(c)
    adoptNewStore(s)
    setRestoreOffer(null)
    setTemplatesOpen(false)
  }

  const [llmClient, setLlmClient] = useState<LlmClient | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const rewordAttempted = useRef<Set<string>>(new Set())
  // Opportunity ids with a Challenger reply in flight (blocks a double-wake on rapid re-commit).
  const challengerBusy = useRef<Set<string>>(new Set())
  // True while ANY Challenger wording call is in flight - the right rail shows a thinking line.
  const [challengerThinking, setChallengerThinking] = useState(false)
  // Client-computed cost meter (no telemetry): every LLM call reports its metering here.
  const costMeter = useRef(new CostMeter())
  const onClient = (client: LlmClient | null): void => {
    // Wrap the connected client so every call feeds the cost meter (G2) - transparent otherwise.
    setLlmClient(client === null ? null : meteredClient(client, costMeter.current))
    rewordAttempted.current = new Set()
    setOverrides({})
  }

  const canvas = useCanvasStore(store, getCanvas)
  const nudges = useCanvasStore(store, (s) => s.nudges)
  // Two-ink provenance, passed wherever the credibility claim is computed (pencil
  // evidence must never raise it - see core credibilityLadder).
  const provenance = useCanvasStore(store, (s) => s.provenance)
  const northStar = useCanvasStore(store, (s) => getCanvas(s).process.north_star)
  // Primitive selector: re-renders only when an event is actually appended.
  const eventCount = useCanvasStore(store, (s) => s.exportLog().length)

  // The restore offer is only honest over an UNTOUCHED canvas: once real work exists,
  // its one-click Restore would silently replace that work - withdraw it instead.
  useEffect(() => {
    if (restoreOffer !== null && eventCount > 1) setRestoreOffer(null)
  }, [restoreOffer, eventCount])

  // Task runner: word each new nudge with the connected model (rules decide WHETHER; the model
  // only decides HOW). One attempt per rule per connection; failure keeps the deterministic
  // template.
  useEffect(() => {
    if (llmClient === null) return
    for (const n of nudges) {
      if (rewordAttempted.current.has(n.rule_id)) continue
      rewordAttempted.current.add(n.rule_id)
      const template = n.message
      void rewordNudge(llmClient, template, northStar ?? undefined).then((text) => {
        if (text !== template) setOverrides((o) => ({ ...o, [n.rule_id]: text }))
      })
    }
  }, [nudges, llmClient, northStar])

  // Open a fresh session once per store (a loaded .pnav already carries its session.started).
  useEffect(() => {
    if (store.getState().sessionId !== null) return
    store
      .getState()
      .dispatch(buildSessionStartedCandidate(crypto.randomUUID(), DEFAULT_PROCESS_NAME))
  }, [store])

  // One-canvas view state (camera + frame positions). Presentation only. Each WidgetFrame
  // reports its rendered height into the view's measured layer, so autoArrange (and every other
  // height consumer) works from what is actually on screen - no DOM queries needed here.
  const view = useCanvasView()
  const [activeFrame, setActiveFrame] = useState('zone-1')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ceremonyOpen, setCeremonyOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)
  // G5 re-assessment: the diff vs a loaded prior session (read-only), and the file input that loads it.
  const [reassess, setReassess] = useState<ReassessData | null>(null)
  const compareInputRef = useRef<HTMLInputElement | null>(null)
  // The most recent live Challenger interjection, drawn as the evidence line until re-scored.
  const [liveChallenge, setLiveChallenge] = useState<ChallengeIssuedPayload | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(true)
  const [mode, setMode] = useState<Mode>('guided')
  // Facilitator surface state lives HERE, not in the panel: hiding the agent rail or
  // switching to Express unmounts the panel, and parked tangents (and the session
  // clock) must survive that - losing a user's parking lot to a UI toggle is data loss.
  const [parked, setParked] = useState<string[]>([])
  const [sessionStartedAt] = useState(() => Date.now())
  const guided = mode === 'guided'
  // Small screens get an honest notice: viewing works, editing is cramped (desktop-first).
  const [smallScreenDismissed, setSmallScreenDismissed] = useState(false)
  // The window size as state, refreshed by one debounced resize listener: reading
  // window.innerWidth during render froze the small-screen notice and the minimap/fly viewport
  // at whatever the window measured when a render happened to run.
  const [winSize, setWinSize] = useState(() =>
    typeof window === 'undefined'
      ? { w: 1024, h: 768 }
      : { w: window.innerWidth, h: window.innerHeight },
  )
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onWindowResize = (): void => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        setWinSize({ w: window.innerWidth, h: window.innerHeight })
      }, 100)
    }
    window.addEventListener('resize', onWindowResize)
    return () => {
      if (timer !== null) clearTimeout(timer)
      window.removeEventListener('resize', onWindowResize)
    }
  }, [])
  const smallScreen = winSize.w < 900
  // Live cost meter: the wrapped client feeds costMeter; mirror its running total into state.
  const [costUsd, setCostUsd] = useState(0)
  useEffect(() => {
    const meter = costMeter.current
    return meter.subscribe((s) => setCostUsd(s.usd))
  }, [])

  const viewport = (): { w: number; h: number } => ({
    w: Math.max(320, winSize.w - 230 - (rightOpen ? 320 : 0)),
    h: Math.max(320, winSize.h - 46),
  })

  // The export handler cluster (checkpoint, walk-through, HACCP, session-PNG, re-assess).
  // storeRef tracks the CURRENT store so a slow export cannot dispatch its follow-up
  // event into a session that was swapped away mid-render (updated in an effect, never
  // during render, per the hooks rules).
  const storeRef = useRef<ReturnType<typeof makeStore> | null>(null)
  useEffect(() => {
    storeRef.current = store
  }, [store])
  const exporters = useExports(store, storeRef)
  // The keyless scripted demo driver (N1).
  const demo = useDemo({
    makeStore,
    adoptStore: adoptNewStore,
    flyToZone: view.flyToZone,
    viewport,
    setActiveFrame,
    setLiveChallenge,
    closeOverlays: () => {
      setTemplatesOpen(false)
      setBriefing(null)
      setRestoreOffer(null)
    },
    // A finished/stopped demo is "clean": no unsaved-work nag for content the user
    // never authored. Their first own edit after it makes the session dirty again.
    // markSaved targets whichever store the closure holds - if that is a departed demo
    // store, the write lands harmlessly on ITS watermark, never the new session's.
    onPlaybackEnd: () => {
      const st = store.getState()
      st.markSaved(st.exportLog().length)
    },
  })

  // Map-driven autopopulation (card 3060): after a HUMAN map edit, deterministic
  // friction/idea suggestions land as agent pencil for per-item review. Paused while
  // the scripted demo is driving dispatches (its replayed human events are a story,
  // not the user mapping); loads are covered by the hook's own baseline.
  useAutoDerive(store, demo.isDemoDriving(store))
  // Full auto-redraft (card 3089, amendment 2026-07-24b): with a model connected, the
  // business case follows its inputs - change an assumption and the draft re-runs
  // (debounced, superseding, born pencil).
  useAutoRedraft(store, llmClient, demo.isDemoDriving(store))

  // --- Data-loss protection -----------------------------------------------------

  // Debounced autosave: every accepted event schedules a localStorage write. Two rules
  // keep the single slot trustworthy: (1) a demo-derived store NEVER writes - the slot
  // may hold the only copy of a real session, and demo content must not clobber it
  // (demo tinkering is kept via explicit Save); (2) pending writes are FLUSHED, not
  // dropped, on tab close and on store swap - a refresh 500ms after the last edit, or
  // loading another session, must not lose the tail of this one.
  useEffect(() => {
    if (demo.isDemoStore(store)) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const write = (): void => {
      const sid = store.getState().sessionId
      if (sid !== null) writeAutosave(window.localStorage, sid, store.getState().exportLog())
    }
    const flush = (): void => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
        write()
      }
    }
    const unsubscribe = store.subscribe(() => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        write()
      }, 800)
    })
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
      unsubscribe()
    }
    // demo.isDemoStore reads a ref; store is the real dependency (exhaustive-deps is advisory).
  }, [store])

  // Offer to restore a previous autosave - once, at launch, before any user work exists.
  useEffect(() => {
    // Housekeeping: drop the locale preference a removed interim build may have written.
    try {
      window.localStorage.removeItem('procezio.locale')
    } catch {
      /* best-effort */
    }
    if (store.getState().exportLog().length > 1) return
    // A ?new=1 tab (the SessionBar's New button) starts truly from scratch: it must
    // not offer to restore the autosave of the very tab that opened it.
    if (new URLSearchParams(window.location.search).get('new') !== null) return
    const saved = readAutosave(window.localStorage)
    if (saved !== null && saved.ok && saved.events.length > 1) {
      setRestoreOffer(saved.events)
    }
    // Launch-only by design (exhaustive-deps is advisory in this repo).
  }, [])

  // Warn before closing with work not yet saved to a file (the autosave still catches an
  // accidental close; the warning covers the deliberate one). Suppressed only while the
  // demo is actively DRIVING - tinkering on a finished demo is real, warnable work.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      const st = store.getState()
      if (hasUnsavedWork(st.exportLog().length, st.savedUpTo) && !demo.isDemoDriving(store)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [store])

  // --- Deep links: the zero-setup front door ------------------------------------

  // ?demo=1 plays the keyless demo; ?template=<id> starts (or offers) a template. Both
  // exist so a recipient with zero setup - and no idea ⌘K exists - lands somewhere alive.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') !== null) {
      demo.runDemo()
      return
    }
    const templateId = params.get('template')
    if (templateId !== null) {
      void import('./templates/templates.generated.js').then(({ TEMPLATES }) => {
        const tpl = TEMPLATES.find((t) => t.id === templateId)
        if (tpl !== undefined) startFromTemplate(tpl)
        else setTemplatesOpen(true)
      })
    }
    // Launch-only by design (exhaustive-deps is advisory in this repo).
  }, [])

  const selectFrame = (id: string): void => {
    setActiveFrame(id)
    const { w, h } = viewport()
    view.flyToFrame(id, w, h)
  }
  const selectZone = (zone: number): void => {
    selectFrame(`zone-${zone}`)
    // A3 "recalculating": a soft nudge (never a block) if you jumped ahead of an unfinished zone.
    const reroute = recalcRoute(getCanvas(store.getState()), zone)
    if (reroute !== null) toast(reroute)
  }

  // Ctrl/Cmd+K toggles the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Built inline (not memoized) so every command closes over the CURRENT view/rightOpen - a
  // memoized list would fly the camera to a frame's pre-drag position. The palette only
  // re-renders while open, so the fresh array each render costs nothing.
  const commands: Command[] = [
    ...ZONES.map((z) => ({
      id: `goto-${z.id}`,
      label: `Go to ${z.name}`,
      hint: String(z.id),
      run: () => selectZone(z.id),
    })),
    { id: 'goto-shoebox', label: 'Go to Shoebox', run: () => selectFrame('shoebox') },
    {
      id: 'demo',
      label: 'Watch the 3-min demo (no key needed)',
      run: () => demo.runDemo(),
    },
    {
      id: 'template',
      label: 'Start from a template (P2P / O2C / carrier)',
      run: () => setTemplatesOpen(true),
    },
    {
      id: 'commit',
      label: 'Sign & commit scores (wake the Challenger)',
      run: () => setCeremonyOpen(true),
    },
    {
      id: 'checkpoint',
      label: 'Export the friction-map checkpoint (value before the case)',
      run: () => exporters.exportCheckpoint(),
    },
    {
      id: 'replay',
      label: 'Replay the session (time-travel over the log)',
      run: () => setReplayOpen(true),
    },
    {
      id: 'reassess',
      label: 'Compare to a prior session (re-assessment diff)',
      run: () => compareInputRef.current?.click(),
    },
    {
      id: 'walkthrough',
      label: 'Export the doer walk-through sheet (print for the doer)',
      run: () => exporters.exportWalkthrough(),
    },
    {
      id: 'haccp',
      label: 'Export the HACCP risk worksheet (hazards from your map)',
      run: () => exporters.exportHaccp(),
    },
    {
      id: 'export-session-png',
      label: 'Export one-pager PNG with a reopenable session (H3)',
      run: () => exporters.exportSessionPng(),
    },
  ]

  const committedOpps = (canvas.opportunities ?? []).filter((o) => o.committed === true)
  const signCommitment = (): void => {
    const sessionId = store.getState().sessionId
    const ids = committedOpps.map((o) => o.id)
    if (sessionId === null || ids.length === 0) {
      setCeremonyOpen(false)
      return
    }
    // Whether the Challenger may speak is the RULESET's call (hard rule 1: versioned
    // rules decide WHETHER; the app and the LLM only decide HOW). The engine runs on
    // this dispatch and appends a zone6-challenger-wake rule.fired only when the rule's
    // tier, budget, cooldown and dismissal gates all pass - so the wake is keyed to
    // whether THIS commitment actually grew that count. Re-deriving the decision here
    // (the old behavior) fired challenges the versioned ruleset had ruled out.
    const wakeFiredCount = (): number =>
      store
        .getState()
        .exportLog()
        .filter(
          (e) =>
            e.type === 'rule.fired' &&
            (e.payload as { rule_id?: string }).rule_id === 'zone6-challenger-wake',
        ).length
    const firedBefore = wakeFiredCount()
    // Guarded non-empty above; the payload types opportunity_ids as a non-empty tuple.
    store
      .getState()
      .dispatch(buildCommitmentCandidate(sessionId, ids as [string, ...string[]], 'local-user'))
    setCeremonyOpen(false)
    // Clear any prior evidence line so a new round that raises no challenge leaves none showing.
    setLiveChallenge(null)
    const ruleFired = wakeFiredCount() > firedBefore
    toast(
      llmClient && ruleFired
        ? 'Commitment logged. The Challenger may now speak - with canvas evidence only.'
        : llmClient
          ? 'Commitment logged.'
          : 'Commitment logged. Connect a model and the Challenger will test these scores.',
    )
    if (ruleFired) wakeChallenger(sessionId)
  }

  // The commitment woke the Challenger - the zone6-challenger-wake rule FIRED on it
  // (checked by the caller); this only WORDS the challenge, with a model connected. It
  // challenges the first committed opportunity that carries a score, at the escalation
  // rung core decides from how many challenges that opportunity has already drawn. No
  // model, or no valid evidence-cited reply -> silence (the score stands; the
  // methodology never needed the model).
  const wakeChallenger = (sessionId: string): void => {
    if (llmClient === null) return
    const live = getCanvas(store.getState())
    const target = (live.opportunities ?? []).find((o) => o.committed === true && o.score)
    if (target === undefined || target.score === undefined) return
    // In-flight guard: `pri` is read before the awaited reply lands, so signing twice fast would
    // otherwise emit two challenges at the same rung. Skip a wake while one is pending for this
    // opportunity; the count stays accurate and the ladder cannot skip a rung.
    if (challengerBusy.current.has(target.id)) return
    challengerBusy.current.add(target.id)
    setChallengerThinking(true)
    // Staleness token: if the store is swapped while the wording call is in flight
    // (a .pnav load, a template, the demo), the reply belongs to the DEPARTED session -
    // surfacing its card here would let one click write a challenge.answered citing an
    // opportunity that does not exist in the new session's log.
    const run = swapRun.current
    const pri = store
      .getState()
      .exportLog()
      .filter(
        (e) =>
          e.type === 'challenge.issued' &&
          (e.payload as { opportunity_id?: string }).opportunity_id === target.id,
      ).length
    void runChallengeIssued(llmClient, {
      opportunityId: target.id,
      title: target.title,
      benefit: target.score.benefit,
      effort: target.score.effort,
      tier: challengeTier(pri),
      dimension: challengedDimension(target.score.benefit, target.score.effort),
      evidence: assembleEvidence(live),
      citable: citableRefs(live),
    })
      .then((payload) => {
        if (payload === null || swapRun.current !== run) return
        store.getState().dispatch(buildChallengeIssuedCandidate(sessionId, payload))
        setLiveChallenge(payload)
        toast(
          `The Challenger (${payload.tier}) questions the ${payload.dimension} - see the evidence line.`,
        )
      })
      .finally(() => {
        challengerBusy.current.delete(target.id)
        if (swapRun.current === run) setChallengerThinking(challengerBusy.current.size > 0)
      })
  }

  const activeZoneNum = activeFrame.startsWith('zone-') ? Number(activeFrame.slice(5)) : 0
  const committedCount = (canvas.opportunities ?? []).filter((o) => o.committed === true).length

  // Affordance gating (A4): the risk gate is locked until at least one idea is committed.
  const lockFor = (frameId: string): string | undefined => {
    if (frameId === 'zone-7' && committedCount === 0) {
      return 'Locked until at least one idea is committed in Prioritize.'
    }
    return undefined
  }

  const frameContent = (frameId: string) => FRAME_RENDERERS[frameId]?.(store, llmClient) ?? null

  // A brand-new, untouched canvas (no demo, no restore offer pending): show the start chips.
  const showStart = eventCount <= 1 && demo.demoCaption === null && restoreOffer === null

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        color: theme.text,
        fontFamily: theme.sans,
        overflow: 'hidden',
      }}
    >
      {/* Left rail: brand + zone navigation (camera flight) + session controls. */}
      <div
        style={{
          width: 230,
          flex: '0 0 230px',
          height: '100%',
          boxSizing: 'border-box',
          overflowY: 'auto',
          background: theme.surface,
          borderRight: `1px solid ${theme.border}`,
          padding: '14px 12px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Procezio</div>
        <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 14 }}>
          Process Navigator · Understand → Diverge → Converge
        </div>
        <ZoneRail
          canvas={canvas}
          activeZone={activeZoneNum}
          onSelectZone={selectZone}
          onSelectShoebox={() => selectFrame('shoebox')}
          verbose={guided}
        />
        <div style={{ marginTop: 'auto', marginLeft: -12, marginRight: -12 }}>
          <SessionBar store={store} onLoad={loadSession} />
          <HistoryBar store={store} />
        </div>
      </div>

      {/* Centre: top bar over the infinite canvas. */}
      <div
        style={{
          flex: '1 1 auto',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TopBar
          canvas={canvas}
          provenance={provenance}
          costUsd={costUsd}
          modelConnected={llmClient !== null}
          mode={mode}
          onSetMode={setMode}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenExport={() => setExportOpen(true)}
        >
          <button
            type="button"
            onClick={() => setRightOpen((o) => !o)}
            aria-label={rightOpen ? 'Hide the agent panel' : 'Show the agent panel'}
            style={{
              fontSize: 11,
              color: theme.textMuted,
              background: theme.surface2,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              padding: '3px 9px',
              cursor: 'pointer',
            }}
          >
            {rightOpen ? 'Hide agent' : 'Agent'}
          </button>
        </TopBar>
        <div style={{ flex: '1 1 auto', position: 'relative' }}>
          <BriefingBanner briefing={briefing} onDismiss={() => setBriefing(null)} />
          {restoreOffer !== null && (
            <RestoreBanner
              eventCount={restoreOffer.length}
              onRestore={() => loadSession(restoreOffer)}
              onDiscard={() => {
                clearAutosave(window.localStorage)
                setRestoreOffer(null)
              }}
            />
          )}
          <DemoCaption caption={demo.demoCaption} onStop={demo.stopDemo} />
          {/* Orientation hint - drag/scroll/click/palette. Guided mode only. */}
          {guided && (
            <div
              style={{
                position: 'absolute',
                left: 10,
                top: 8,
                zIndex: 30,
                fontSize: 11,
                color: theme.textMuted,
                background: 'rgba(255,255,255,0.85)',
                borderRadius: 8,
                padding: '4px 9px',
                pointerEvents: 'none',
              }}
            >
              {t('orientation.hint')}
            </div>
          )}
          {/* The front door: a brand-new visitor sees the demo + template chips, not ⌘K. */}
          {showStart && (
            <div
              style={{
                position: 'absolute',
                right: 12,
                top: 8,
                zIndex: 30,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => demo.runDemo()}
                title={t('start.demoHint')}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 16,
                  padding: '6px 13px',
                  background: theme.accent,
                  color: theme.onAccent,
                  border: `1px solid ${theme.accent}`,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
                }}
              >
                {t('start.demo')}
              </button>
              <button
                type="button"
                onClick={() => setTemplatesOpen(true)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 16,
                  padding: '6px 12px',
                  background: theme.surface,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  cursor: 'pointer',
                }}
              >
                {t('start.template')}
              </button>
            </div>
          )}
          {/* Small-screen honesty: desktop-first, and we say so instead of half-working. */}
          {smallScreen && !smallScreenDismissed && (
            <div
              role="status"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 12,
                transform: 'translateX(-50%)',
                zIndex: 35,
                width: 'min(420px, 94vw)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                fontSize: 12,
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                boxShadow: '0 8px 30px rgba(0,0,0,0.16)',
                padding: '8px 12px',
                color: theme.textMuted,
              }}
            >
              <span style={{ flex: '1 1 auto' }}>{t('smallScreen.notice')}</span>
              <button
                type="button"
                onClick={() => setSmallScreenDismissed(true)}
                aria-label="Dismiss"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: theme.textMuted,
                  cursor: 'pointer',
                  fontSize: 15,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}
          <CanvasWorld camera={view.camera} panBy={view.panBy} zoomAt={view.zoomAt}>
            {view.frames.map((frame) => (
              <WidgetFrame
                key={frame.id}
                frame={frame}
                zoom={view.camera.zoom}
                active={activeFrame === frame.id}
                lockedReason={lockFor(frame.id)}
                onMove={(x, y) => view.moveFrame(frame.id, x, y)}
                onResize={(w, h) => view.resizeFrame(frame.id, w, h)}
                onResizeEnd={() => view.autoArrange(frame.id)}
                onHeightChange={(h) => view.reportHeight(frame.id, h)}
                onFocus={() => setActiveFrame(frame.id)}
              >
                <Suspense fallback={<FrameLoading />}>{frameContent(frame.id)}</Suspense>
              </WidgetFrame>
            ))}
            <EvidenceLine frames={view.frames} canvas={canvas} challenge={liveChallenge} />
          </CanvasWorld>
          <Zoomer
            onZoomIn={() => {
              const { w, h } = viewport()
              view.zoomStep(1.2, w, h)
            }}
            onZoomOut={() => {
              const { w, h } = viewport()
              view.zoomStep(1 / 1.2, w, h)
            }}
            onFit={() => view.resetCamera()}
          />
          <Minimap
            frames={view.frames}
            camera={view.camera}
            viewportW={viewport().w}
            viewportH={viewport().h}
            onNavigate={(wx, wy) => {
              const { w, h } = viewport()
              view.centerOn(wx, wy, w, h)
            }}
          />
        </div>
      </div>

      {/* Right rail: the agent surface + ledger, collapsible. */}
      {rightOpen && (
        <aside
          aria-label="Agent and ledger"
          style={{
            flex: '0 0 320px',
            width: 320,
            height: '100%',
            boxSizing: 'border-box',
            borderLeft: `1px solid ${theme.border}`,
            background: theme.surface,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          <PersonaLegend />
          {/* The wake is in flight: silence after the ceremony reads as broken. */}
          {challengerThinking && liveChallenge === null && (
            <div
              role="status"
              style={{
                margin: '8px 12px 0',
                padding: '8px 11px',
                fontSize: 12,
                color: theme.textMuted,
                border: `1.5px dashed ${theme.pencil}`,
                background: theme.pencilSoft,
                borderRadius: 10,
              }}
            >
              ⏳ {t('challenger.thinking')}
            </div>
          )}
          {liveChallenge && (
            <ChallengerCard
              challenge={liveChallenge}
              onRespond={(response) => {
                const sid = store.getState().sessionId
                if (sid !== null)
                  store
                    .getState()
                    .dispatch(
                      buildChallengeAnsweredCandidate(sid, liveChallenge.opportunity_id, response),
                    )
                setLiveChallenge(null) // clears the card and the evidence line
              }}
            />
          )}
          <SettingsPanel store={store} onClient={onClient} />
          <ChatPanel store={store} client={llmClient} />
          <SeedBar store={store} client={llmClient} />
          <PencilReview store={store} />
          <NudgePanel store={store} overrides={overrides} />
          {guided && (
            <FacilitatorPanel
              startedAt={sessionStartedAt}
              parked={parked}
              onPark={(text) => setParked((p) => [...p, text])}
              onRemove={(i) => setParked((list) => list.filter((_, j) => j !== i))}
            />
          )}
          <div style={{ flex: '1 1 auto', minHeight: 0 }}>
            <AssumptionPanel store={store} onGoToZone={selectZone} />
          </div>
        </aside>
      )}

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
      <CommitCeremony
        open={ceremonyOpen}
        titles={committedOpps.map((o) => o.title)}
        onSign={signCommitment}
        onClose={() => setCeremonyOpen(false)}
      />
      <ExportPopover
        open={exportOpen}
        canvas={canvas}
        provenance={provenance}
        onClose={() => setExportOpen(false)}
      />
      {templatesOpen && (
        <Suspense fallback={null}>
          <TemplatePicker open onPick={startFromTemplate} onClose={() => setTemplatesOpen(false)} />
        </Suspense>
      )}
      {replayOpen && (
        <Suspense fallback={null}>
          <ReplayScrubber
            events={store.getState().exportLog()}
            onClose={() => setReplayOpen(false)}
          />
        </Suspense>
      )}
      {reassess && (
        <Suspense fallback={null}>
          <ReassessDiff
            diff={reassess.diff}
            schedule={reassess.schedule}
            priorName={reassess.name}
            onClose={() => setReassess(null)}
          />
        </Suspense>
      )}
      <input
        ref={compareInputRef}
        type="file"
        accept=".pnav,.procez,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          // Capture the File before resetting the input - the FileList is live.
          const promise = exporters.compareToPrior(e.target.files)
          e.target.value = ''
          void promise.then((data) => {
            if (data !== null) setReassess(data)
          })
        }}
      />
      <ToastHost />
    </div>
  )
}
