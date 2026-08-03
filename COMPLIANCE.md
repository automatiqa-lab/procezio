# EU AI Act compliance - Procezio

Not legal advice. This file records how Procezio meets its transparency obligations, and why. It is
the project's defence file: entries are dated and their history is in git.

Contact for compliance and incident reports: aleks@automatiqa.io

## Role classification

**Procezio is a provider of an AI system.** The lab publishes it under its own name and it is
intended to interact directly with a natural person, so Article 50(1) and 50(2) apply. It is not a
general-purpose AI model and the lab neither trains nor distributes one: Procezio sends prompts to
an OpenAI-compatible endpoint that the user configures and holds the key for, so Chapter V
obligations sit with whoever provides that model. The Article 2(12) free-and-open-source exemption
is treated as unavailable, because it is formal only and would lapse the moment the project is
commercialised - designing around it would mean rebuilding this later.

Recorded 2026-08-03.

## Obligations that apply

| Obligation | Applies | How this project meets it |
|---|---|---|
| Art. 50(1) interaction disclosure | yes | The agent is named as an agent throughout the interface, the topbar carries a model-connection state, and every contribution renders as pencil until a human accepts it. `disclosure.yaml` holds an explicit session notice rather than relying on that alone. |
| Art. 50(2) machine-readable marking | yes | Exports carry a document information dictionary and an XMP packet (PDF), text chunks (PNG), and a disclosure header in the `.pnav` session file. Schema `automatiqa-disclosure/1`. |
| Art. 50(4) deployer disclosure | deployer-side | Applies to whoever republishes an exported sheet. See below. |
| Art. 4 AI literacy | yes | This file, the README section, and `docs/security-fact-sheet.md`. |
| Art. 5 prohibited practices | screened | Procezio maps business processes on a canvas. It performs no biometric inference, no emotion recognition, no scoring of people, and generates no images or audio. |
| Annex III high-risk | no | See screening. |

## Annex III screening

Procezio helps a person describe a process they already run and spot improvement opportunities in
it. Two Annex III areas are close enough to name explicitly rather than wave away.

**Employment and worker management** is the real near-miss. Annex III covers systems used to recruit,
select, evaluate performance, or allocate tasks to people. Procezio maps steps, handoffs and waiting
time in a process, and its outputs describe work rather than the people doing it: it produces no
ranking of individuals, no performance measure attached to a person, and no allocation of tasks. If
a future feature scored or compared named individuals, that would change the classification and this
screening would have to be redone before the feature shipped.

**Critical infrastructure** does not apply. That entry is limited to safety components in the
management and operation of critical digital infrastructure, road traffic, and the supply of water,
gas, heating and electricity. A canvas describing a commercial process is none of those, and
Procezio has no control-loop connection to any physical system.

Screened 2026-08-03. Re-run on any change of purpose or new modality.

## What this project does out of the box

The marking is built at the boundary, not bolted onto the interface.

- The envelope and its per-format expressions live in `core/src/disclosure.ts`, so the same five
  facts reach every output.
- Wording lives in `disclosure/disclosure.yaml`, a ratified artifact amended by PR. The browser
  cannot parse YAML under the strict Solo CSP, so `ci:disclosure-drift` compiles it to a generated
  module and fails the build if the two drift apart. The gate also refuses a config whose
  `wording.none` is non-empty, or whose visible strings interpolate a model name.
- Counts come from the two-ink provenance the event store already projects. Nothing new is tracked:
  an item born pencil was written by the agent, and the store derives that from `author.kind`, which
  no code path can forge.
- Exports carry the marking in both channels. The visible line sits under the existing footer; the
  machine-readable half rides in PDF `/Info` plus XMP, PNG text chunks, and the `.pnav` header.

Marking schema: `automatiqa-disclosure/1`, wording from `disclosure.yaml` version 1.

## Carve-outs, and why

**Nothing is labelled where the agent wrote nothing.** A canvas built entirely by hand exports
exactly as it did before this work: no line, no envelope, no metadata. This is deliberate and it is
the part most likely to be questioned, so the reasoning is worth stating. Marking human-authored
content as AI-generated is not caution, it is a false statement about provenance, and it teaches
readers to ignore the marking everywhere else. Because the absence of a marking is itself a claim,
the code emits nothing rather than emitting a negative, and the tests assert that.

**The model is never named in visible output.** Article 50 requires disclosing that content is
AI-generated, never which system produced it. Procezio's endpoint is the user's own - often a local
Ollama or LM Studio instance - so printing a model id on an exported sheet would disclose their
local setup to every recipient for no legal benefit. The envelope reserves an optional `model` field
for operators who choose the model centrally; Procezio never sets it.

**Pencil is not a label, it is the editorial-control mechanism.** Agent contributions render as
pencil and become part of the case only when a human accepts them. Where a person has reviewed and
accepted a draft, the exported sheet says so - drafted by the agent, accepted by the author - rather
than presenting the artefact as machine-authored. Unreviewed pencil is disclosed as unreviewed.

## What remains the deployer's job

Procezio runs entirely in the browser and has no server, so there is no deployment in the usual
sense. What travels is the export.

If you circulate an exported sheet, session file or image inside the EU, keep the marking intact.
Re-flattening a PDF through a tool that discards the information dictionary, or stripping PNG text
chunks, removes it. If you republish AI-assisted text on a matter of public interest, Article 50(4)
applies to you directly.

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-08-03 | Role: provider. OSS exemption not relied on. | Formal only, lapses on commercialization. |
| 2026-08-03 | Enforce disclosure at `createLlmClient`, not as an outer decorator. | `SettingsPanel` builds a raw client for the capability probe before `meteredClient` wraps it, so a decorator would leave that path uncovered. |
| 2026-08-03 | Conditional marking; nothing emitted when nothing was drafted. | An absent marking must stay a truthful claim, which is what lets a reader trust a present one. |
| 2026-08-03 | Model never named in visible output. | Not required by Art. 50, and the endpoint is the user's own. |
| 2026-08-03 | `disclosure.yaml` ratified, drift-gated. | Wording that decides a legal claim should not change by drive-by commit. |
