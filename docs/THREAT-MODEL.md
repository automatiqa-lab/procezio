# Threat model - Solo mode

This is the security reasoning behind Procezio's Solo edition: what it protects, what it
assumes, and where the honest residual risks are. Solo runs **entirely in your browser** -
there is no Procezio server, no account, no backend to breach. That shape is the strongest
security property here, and most of this document follows from it.

The static-source checks in `ci:security-solo` and the runtime `e2e/privacy.spec.ts` test are
the automated enforcement of the promises below; this document is the "why".

## What we protect

- **Your process knowledge.** The canvas - the process you draw, the frictions, the figures,
  the business case - is the sensitive asset. The core promise is that it never leaves your
  machine except to a model endpoint you configure yourself.
- **Your model credentials.** If you connect a cloud model, its API key is a secret we must
  never persist, log, or leak into a shareable file.
- **The integrity of provenance.** The two-ink rule (agent contributions are "pencil" until a
  human accepts them) must not be forgeable - a saved session must not be able to smuggle in
  agent content dressed as human-accepted "ink".

## Trust boundaries

1. **The browser origin** - the app's own code and same-origin storage. Trusted.
2. **The model endpoint** - whatever OpenAI-compatible URL you configure (local Ollama, a
   cloud provider, an enterprise gateway). Semi-trusted: we send it prompts and treat its
   responses as **data, never code**.
3. **A `.pnav` session file** - untrusted input, even one you saved yourself (it may have been
   edited or corrupted). Every event in it is re-validated on load.
4. **Everything else** (CDNs, analytics, telemetry) - **out of scope by construction**: there
   is deliberately no egress to any of it.

## Controls

- **No egress except to your endpoint.** No telemetry, analytics, CDN, or remote fonts.
  Enforced statically (`ci:security-solo` greps for non-endpoint fetch origins) and at runtime
  (the privacy E2E test fails if the running app makes any off-origin request).
- **Strict Content-Security-Policy.** `default-src 'self'`, no `'unsafe-eval'` anywhere,
  `object-src 'none'`, `base-uri 'self'`. `connect-src` is same-origin, the two loopback
  model origins the presets offer (local Ollama on 11434, the key-holding local proxy on
  8080 - nothing leaves the machine by default), and the non-resolvable placeholder for a
  remote endpoint. The build fails if the CSP is missing, weakened with `unsafe-eval`, or
  widened to any non-loopback origin (`ci:security-solo` pins `connect-src`).
- **Model output is data, never code.** No `eval`, no `new Function`, no `innerHTML` of model
  text. Responses are parsed as JSON and validated against a schema; a malformed or malicious
  response is rejected and repaired or dropped, never executed. CI greps for these sinks.
- **The API key is ephemeral.** It lives in memory for the session and is sent only to your
  configured endpoint. It is never written to a `.pnav`, never logged, never placed in a URL.
  CI fails if a key-shaped value is written to a session file.
- **`.pnav` is validated as untrusted.** On load, every event is re-checked against the
  ratified schema. Provenance forgery is defeated at replay: the event store re-derives each
  element's provenance from the author, so a file claiming `ink` on an agent event simply
  becomes `pencil` again - it cannot fake human acceptance.
- **Deterministic control plane.** Rules (not the LLM) decide whether the agent acts; replay
  is byte-deterministic. This bounds what a compromised or adversarial model can *cause* - it
  can influence wording, not trigger actions or rewrite state.

## Residual risks (honest)

- **API key in the browser.** In Solo, a cloud key is held in the browser tab. This is
  inherent to a no-backend BYO-model design. Mitigations: prefer a **local** model (Ollama)
  or a **reverse proxy** that injects the key server-side (see `docker/`), so the key never
  reaches the browser at all. For cloud use, scope/rotate the key.
- **Where your `.pnav` is stored.** A session file is plaintext JSON of your process. If you
  save it to a synced cloud folder, it inherits that folder's exposure. The file carries no
  secrets (no key), but it does carry your process knowledge - store it where you'd store any
  sensitive working document.
- **Your chosen model endpoint sees your prompts.** Connecting a cloud model means your canvas
  excerpts are sent to that provider under *their* terms. Choosing the endpoint is choosing
  who sees the data - a local model keeps it fully on-device.
- **Supply chain.** Dependencies are held to an MIT/Apache-2.0/BSD/ISC/PostgreSQL allowlist
  (license gate), scanned (CodeQL, Dependabot), and enumerated in a published SBOM - but any
  dependency is still trusted code. The from-scratch core keeps that surface small.

## Reporting

Found something? See [SECURITY.md](../SECURITY.md). Please report privately first.
