# scripts/

The gate suite, and the codegen behind it.

`gates/` holds one script per check in `ci:all`. CI runs that single command rather than listing the
gates itself, so a gate added to `package.json` runs in CI automatically and the two can never drift
apart.

Two kinds live here:

**Drift gates** - `schema-drift`, `validators-drift`, `ruleset-drift`, `prompt-pack-drift`,
`templates-drift`, `registry-drift`, `disclosure-drift`. Each pairs an authored artifact (YAML or
JSON) with a generated form the app imports, fails when they diverge, and regenerates with
`--write`. Generated files are never edited by hand; the gate is what makes that rule enforceable
rather than aspirational.

**Property gates** - `typecheck`, `license`, `fixtures`, `replay` (determinism), `security-solo`
(no `eval`, no hardcoded fetch origin, CSP intact), and `bundlesize` (a hard gzip budget). These
assert things about the build that a reviewer cannot reliably check by reading a diff.

`ci/` holds the tests for the gates themselves - a gate that silently stops checking is worse than
no gate, so several of them are exercised against deliberately broken fixtures.

Run the whole suite the way CI does:

```bash
corepack pnpm run ci:all
```
