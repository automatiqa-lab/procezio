# Test scenarios

Two ways to try the UI, both against the Docker build on http://localhost:8080.

## 1. Existing scenarios (fully populated, end to end)

Three ready sessions, each a real process carried through the **whole** loop - pain-first frame,
mapped steps and friction, one committed improvement idea, its benefit/effort score, the signed
commit ceremony (so the Challenger is awake), all five risk-gate checks cleared, and a sourced
improvement case ready for the one-pager. Load one to inspect every visual element and the logic
before you test from a blank canvas.

| Scenario file | Process | North-star |
|---|---|---|
| `demo/p2p-scenario.pnav` | Purchase-to-Pay | cut invoice cycle time 3 days -> 1 |
| `demo/o2c-scenario.pnav` | Order-to-Cash | cut DSO 45 -> 30 |
| `demo/carrier-scenario.pnav` | Carrier onboarding | cut onboarding 15 -> 5 working days |

**Load one:** in the right-hand rail, the session bar -> **`↑ Open`** and choose the `.pnav` file.
The canvas loads fully populated, exactly as replayed from its event log.

**Or start fresh from a template** (Understand side only, Diverge/Converge empty): press
`Ctrl/Cmd+K` -> "Start from a template" -> pick **P2P**, **O2C**, or **Carrier onboarding**.

From a loaded scenario: click a step node for its detail panel; open the Improvement case (zone 8)
and the one-pager export to see the credibility header read its figures and assumptions; open the
Risk gate (zone 7) to see the cleared checks; the sparring bench shows the Challenger awake.

The keyless scripted demo (`Ctrl/Cmd+K` -> "Watch the 3-min demo") plays the P2P loop end to end
with no model connected.

## 2. Blank canvas

Just open http://localhost:8080 - a fresh, empty session. Start in Frame (zone 1): describe the
process from memory, or use the Seed box in the right rail (with a model connected) to sketch a first
map you then correct.

## Regenerating the scenario files

The `demo/*-scenario.pnav` files are generated from the shipped templates + a fixed narrative, so
they never drift from the templates:

```
corepack pnpm --filter @procezio/app run build:node
node scripts/gen-scenario.mjs
```
