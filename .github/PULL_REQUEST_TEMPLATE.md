## What and why

<!-- One bounded change. What does it do, and why? -->

## Checklist

- [ ] `corepack pnpm run ci:all` is green locally (typecheck, license, drift gates, rule
      fixtures, replay, Solo security scan, acceptance tests).
- [ ] New pure functions / event helpers have a `node:test` acceptance test, wired into the
      `ci:acceptance` / `ci:all` lists.
- [ ] If this touches the schema, rulesets, or prompt pack: rationale is in the description,
      and the generated artifacts are regenerated (drift gates pass).
- [ ] UI change: verified in a real browser, and the deterministic canvas still works with
      no model connected.
- [ ] No new dependency outside the license allowlist (MIT / Apache-2.0 / BSD / ISC /
      PostgreSQL / 0BSD).
- [ ] Conventional commit(s). Hyphens, not em dashes.

## Notes

<!-- Anything a reviewer should know: trade-offs, follow-ups, screenshots. -->
