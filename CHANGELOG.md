# Changelog

All notable changes to Procezio are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-1.0: the API and the
`.pnav` format may still change between minor versions.

## [Unreleased]

### Changed - v0.4 upgrade (Wave 1, in progress on the feature branch)

The product moves from a fixed 8-zone panel switcher to a **one-canvas improvement-opportunity
canvas** (spec v0.4 consolidated). Landed so far, all additive and behind the green gate suite:

- **Schema (v1.1 -> v1.2, additive):** per-node-type detail panels (Step/Decision/Wait/Start/
  End), a four-grade confidence tag, handoff edges (medium/trigger/branch-share), nine new
  content events (commitment, step.reassigned, tobe.snapshot.accepted, shoebox.*, extraction,
  challenge issued/answered, checkpoint) plus their LLM contracts, `Opportunity.target_refs`, a
  Shoebox projection, and a **separate presentation-event stream** for geometry (proven disjoint
  from the methodology stream). Every pre-v0.4 session still validates.
- **Core (no LLM):** presentation-stream projection, `step.reassigned` fold, zone completeness
  as **named missing items** (never percentages), deterministic handoff count + HD-2
  Connect-detection, the **target-state composer** (six rung transforms), and the credibility
  ladder + named-source export gate.
- **Rules:** the Challenger now wakes only on the **commitment ceremony** event (fixtures
  prove it stays silent before it).
- **Frontend:** rebuilt as a single infinite pan/zoom surface - movable widget frames, camera
  navigation, the zone rail with live completeness, the command palette (Ctrl/Cmd+K), the
  credibility header + cost meter, affordance-gated locked frames, the Shoebox (per-file egress
  consent), and the commit ceremony.

- **Data-loss protection:** debounced localStorage autosave (validated on restore exactly
  like a `.pnav` import), a restore offer on relaunch, a close-with-unsaved-work warning
  with flush-on-close, and an unsaved-changes indicator in the session bar. Demo-derived
  sessions never write the autosave slot.
- **Discoverability:** `?demo=1` / `?template=<id>` deep links and visible "Watch the
  3-min demo" / "Start from a template" chips on the empty canvas.
- **LLM resilience:** a per-request timeout covering headers AND body, a Cancel button on
  in-flight chat asks (cancel skips retry/fallback), and in-progress indicators for the
  Challenger wake and Shoebox extraction.
- **Accessibility:** one shared modal focus contract (Escape closes the topmost dialog
  only, focus trap + restore, `aria-modal`) across the palette, ceremony, export popover,
  template picker and re-assessment diff; WCAG-AA faint-text contrast.
- **Hardening:** `.pnav` import size cap; untrusted-data framing for Shoebox text in
  prompts; the CSP pinned by CI to self + loopback + placeholder; the docker test proxy
  made unmistakably test-only (unprivileged nginx, loopback-only bind, non-localhost 403).
- **Changed:** the interface is English-only for now (spec §13 amendment 2026-07-19; the
  typed `t()` seam remains). The improvement-case list badge is now gate-aware: an
  opportunity whose risk-gate check is later un-ticked reads "blocked" again even if a
  case was drafted (deliberate honesty change during the model extraction).
- **Internals:** shared `humanInk()`/`agentPencil()` envelope helpers replace every
  hand-written envelope literal; `ci:all` chains `ci:acceptance` (single test list);
  CaseZone/PrioritizeZone derivation extracted to pure, tested model modules; App.tsx
  split into `useExports`/`useDemo` hooks; scenario + demo-playback E2E specs.

Deferred to later Wave-1 cards: presentation-stream persistence to `.pnav`. Descoped from
Wave 1: the German content pack (English-only interface for now).

## [0.1.0] - 2026-07-11

First public release of the Solo edition: the full guided methodology plus the co-working
agent, running entirely in the browser.

### Added

- **The 8-zone canvas** (Understand -> Diverge -> Converge): Frame, Map (drawable
  swimlanes, five shapes), Friction (DOWNTIME), Data & Rules, Ideation, Prioritize,
  Risk gate, Business case.
- **Event-sourced core** (isomorphic TypeScript): append-only event store, deterministic
  projections + snapshots, compensating-event undo/redo, replay-determinism suite.
- **Declarative rule engine** (no LLM): the deterministic control plane; rules decide
  whether the agent reacts, surfaced as dismissible nudges with an interjection budget.
- **The anti-anchoring mechanic**: scores commit before the agent speaks; the 2x2 quadrant
  is derived only after commit.
- **Two-ink provenance**: every agent contribution is born "pencil" until a human accepts
  (-> ink) or rejects (-> removed); deliberate per-item review.
- **The co-working agent** (four generative behaviors, all born pencil): seed a map from a
  description, an evidence-cited zone-6 challenge after commit, ideation candidates, and a
  business-case draft (figures traced to canvas sources, benefit classes enforced). Plus an
  "ask the agent" chat grounded in the canvas.
- **Slim LLM client**: OpenAI-compatible, transport-injected, schema-request with bounded
  repair, capability probe (tiers T0-T3), retries + fallback, metering. Configurable auth
  style (bearer / x-api-key / api-key / none) and provider presets (local Ollama by
  default, OpenAI-compatible, Anthropic / Azure via proxy).
- **Versioned crown-jewel artifacts**: `canvas.schema.json` (single contract), the ruleset,
  and the prompt pack - each authored as source and codegenned to the form the app imports,
  drift-gated in CI.
- **Assumption ledger** with a pre-export verification gate.
- **`.pnav` persistence** with a storage-adapter seam: local file (download + File System
  Access) and Microsoft Graph (OneDrive / SharePoint).
- **Security-first posture**: strict CSP, no eval, egress only to the configured endpoint,
  no telemetry, the API key never in a `.pnav`/log/URL, and a loaded `.pnav` re-validated so
  provenance cannot be forged - all enforced by CI gates.
- **Docker test setup**: nginx serving the app and reverse-proxying a cloud model so the
  key stays server-side.

[Unreleased]: https://github.com/automatiqa-lab/procezio/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/automatiqa-lab/procezio/releases/tag/v0.1.0
