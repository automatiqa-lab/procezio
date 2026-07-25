# Security Policy

Procezio - Process Navigator (Automatiqa Lab by Aleks Sidorecs) is security-first by design: it runs in your browser, a session is a local
`.pnav` file, and process knowledge never leaves your boundary unless you point it at a
model endpoint yourself. We take vulnerability reports seriously.

## Reporting a vulnerability

Please report privately - do not open a public issue for a security problem.

- Preferred: open a private advisory via GitHub Security Advisories ("Report a
  vulnerability" on the Security tab).
- Or email **automate@automati.qa** with the details.

Include what you found, how to reproduce it, the impact, and any suggested fix. If you
have a proof of concept, attach it.

We aim to acknowledge a report within 3 business days and to agree a disclosure timeline
with you. Please give us reasonable time to ship a fix before public disclosure. We will
credit you in the release notes unless you prefer to stay anonymous.

## Scope

In scope: the Solo app (`app/`), the isomorphic core (`core/`), the schema and generated
validators (`schema/`), the rulesets and prompt packs, and the `.pnav` file handling.

The following are enforced by CI and are always in scope for a report if you can break
them:

- No `eval` / dynamic code execution of model output.
- Egress only to the user-configured model endpoint; no telemetry, no third-party origins.
- Strict Content-Security-Policy in the shipped app.
- The API key never written to a `.pnav` file, a log, or a URL.
- A loaded `.pnav` is untrusted input: every event is re-validated, and provenance is
  re-derived on load so a file cannot forge accepted ("ink") state.

## Out of scope

- The `docker/` test setup reverse-proxies a cloud provider with the key held server-side.
  It is a hardened testing convenience - unprivileged nginx, bound to `127.0.0.1` only,
  refusing any non-localhost `Host`, stamping every response `X-Procezio-Proxy: test-only` -
  not the shipped security posture, and not a deployment starting point.
- Bringing your own model endpoint means you trust that endpoint. Pointing the app at a
  hostile endpoint is your risk to manage (a proxy that keeps the key server-side is the
  recommended pattern for anything shared).
- Denial of service against a self-hosted deployment.

## Supported versions

Procezio is pre-1.0. Security fixes land on the latest release. Pin a tagged version for
stability and watch releases for advisories.
