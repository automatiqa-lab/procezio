# Contributing to Procezio

Thanks for your interest. Procezio is a guided automation-opportunity canvas with a
co-working AI agent, for supply-chain and business people who write no code. It is built
spec-first with a hard Definition of Done enforced by CI. This guide gets you productive
and keeps the bar high.

## Ground rules (the constitution)

A few things are non-negotiable - they define the product:

1. The target user writes no code, ever.
2. The core (agent orchestration, methodology engine, event store, rule engine) is built
   from scratch - no LangChain/LangGraph, no event-sourcing framework, no CRDT library.
   Off-the-shelf is fine for rendering and plumbing.
3. Dependencies must be MIT / Apache-2.0 / BSD / ISC / PostgreSQL / 0BSD. CI enforces this
   with a transitive license walk. A new dependency outside the allowlist will fail CI.
4. The LLM never decides WHETHER to act - versioned rules decide. The LLM decides how to
   say it and does bounded generative work. Deterministic control plane, generative
   language surface.
5. Agent contributions are born "pencil" until a human accepts them (the two-ink rule).
6. The methodology works on paper without the agent. The agent accelerates, never gates.

## Setup

```sh
corepack enable
corepack pnpm install
corepack pnpm run ci:all   # the full Definition of Done - run this before you push
```

Node 20+. pnpm via corepack (no bare `pnpm` on PATH is assumed).

The app is a static React SPA:

```sh
corepack pnpm --filter @procezio/app run dev      # dev server
corepack pnpm --filter @procezio/app run build    # production build -> app/dist
```

## The shape of the code

- `schema/` - `canvas.schema.json` is the single contract (ontology + event payloads + LLM
  output shapes). TypeScript types and eval-free validators are GENERATED from it; never
  edit the generated files by hand (CI checks drift). Regenerate with
  `corepack pnpm --filter @procezio/schema run gen` and `gen:validators`.
- `core/` - the isomorphic engine (event store, projections, rule engine, timers/budget,
  the slim LLM client). No `node:*`, no wall clock, no randomness - it runs identically in
  the browser and under `node --test`.
- `rulesets/` and `prompt-packs/` - crown-jewel methodology artifacts, authored as source
  and codegenned to the form the app imports (drift-gated, like the schema).
- `app/` - React + Vite + React Flow + Zustand. The store is the only path that mutates
  canvas state; components are pure views over the projection.

## Working on a change

- One bounded change per pull request. Keep the diff focused.
- Every event-building helper and every pure function gets a real `node:test` acceptance
  test, wired into the `ci:acceptance` / `ci:all` lists in the root `package.json`.
- Touching the schema, rulesets, or prompt pack is an amendment: it needs a clear rationale
  in the PR, and the generated artifacts regenerated so the drift gates pass.
- UI changes: verify in a real browser. The deterministic canvas must keep working with no
  model connected.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Trunk-based, additive
  first.

## Definition of Done (what CI checks)

`corepack pnpm run ci:all` must be green: typecheck, license gate, schema / validators /
ruleset / prompt-pack drift, rule fixtures, replay determinism, the Solo security scan, and
the full acceptance test suite. A pull request cannot merge red.

## Reporting bugs and ideas

Open an issue with the templates. For a security problem, do not open a public issue - see
`SECURITY.md`.

By contributing you agree your contributions are licensed under the project's Apache-2.0
license.
