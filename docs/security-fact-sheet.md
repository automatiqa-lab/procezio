# Procezio (Process Navigator) security fact sheet

A one-page, plain answer to "is it safe to describe our process in this tool?" Written for a
buyer or a security reviewer, not just engineers. Everything below is enforced by the build (CI
gates named in brackets) or verifiable in the source, not just asserted.

## Where your data lives

- **Local-first.** In Solo mode the whole app runs in your browser. Your process map, notes, scores
  and case live in memory and in the session file you save (`.pnav` / `.procez`) - a plain,
  diff-friendly JSON file on your machine. There is no Procezio server and no account.
- **No telemetry, anywhere.** The app sends no analytics, no usage pings, no error reports. The
  cost meter is computed in your browser from local counters; it is never transmitted.
- **The only egress is to the model endpoint you configure.** If you connect a model, requests go
  to the OpenAI-compatible or Anthropic endpoint you entered - and nowhere else. A privacy E2E test
  asserts the app makes no off-origin network requests on load or basic use [e2e/privacy].

## What reaches the model, and when

- **Nothing before you ask.** With no model connected, the full methodology still works - mapping,
  friction, scoring, the commit ceremony, the deterministic to-be, the credibility gate and the
  one-pager all run with zero LLM (a constitutional guarantee, exercised by the keyless demo).
- **Per-file consent for the Shoebox.** A dropped file's content stays on your machine until you
  explicitly click "include" on that item; only then is its text sent to your model. Files that are
  never consented never leave the browser.
- **The agent drafts, it never decides.** Model output is born "pencil" and only becomes part of
  your case when you accept it. Versioned rules - not the model - decide whether the agent may act
  at all.

## Hardening

- **Strict Content-Security-Policy.** The app ships a CSP that blocks external scripts, styles,
  fonts and connections; a CI test fails the build if the CSP tag is missing or weakened with
  `unsafe-eval` [e2e, ci:security-solo]. The one-pager export is a self-contained SVG rendered in
  the browser with zero third-party libraries, so exporting adds no external code and no upload.
- **No `eval` of model output; no hardcoded egress; no secrets in session files.** A static
  security gate scans every source file and fails the build on any of these [ci:security-solo].
- **Permissive dependencies only, license-checked.** A CI gate walks the dependency tree and fails
  on any non-permissive license [ci:license], so nothing copyleft or proprietary can slip in.
- **Deterministic, auditable core.** Truth is an append-only event log; the projection is pure and
  replay-deterministic [ci:replay]. Every change is an attributed event, so a session is fully
  auditable after the fact.

## If you front it with a reverse proxy

A minimal nginx (or any) reverse proxy in front of the built app can keep a cloud API key
**server-side**: the proxy injects it, so the key never enters the browser, a session file, or the
CSP surface. Keep the key in your shell or a gitignored `.env`, never in the repo - and bind such
a proxy to loopback unless you have added real authentication in front of it.

## What Procezio deliberately does not do

No account, no cloud sync, no background uploads, no third-party trackers, no AI-credibility
overclaiming. Simulated content (a drafted figure, a suggested step) is always labelled as such and
the export gate surfaces anything unsourced or unverified before you can share it.
