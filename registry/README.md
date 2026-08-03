# Procezio community registry

Maintained by Automatiqa Lab by Aleks Sidorecs (aleks@automatiqa.io).

Three JSON indexes describe the packs Procezio (Process Navigator) can load: **templates** (starting process maps),
**personas** (prompt-pack sections the agent wears), and **rulesets** (the versioned rules that
decide whether the agent may act). Everything listed here today ships built-in with the app; the
registry is also the contribution surface.

## Layout

| Index | What it lists | Canonical source |
| --- | --- | --- |
| `templates.json` | Starting maps (Understand side only) | `templates/*.json` |
| `personas.json` | Persona packs (voice only, never decide) | `prompt-packs/prompt-pack.json` |
| `rulesets.json` | Rule packs (decide whether to act) | `rulesets/*.yaml` |

Each entry carries an `id`, a human `name` and `description`, a `license`, and a `source`
(`built-in` or, for community packs, the contributor). Template entries also carry a `path`; a
`built-in` template's `path` points at the shipped file.

## Contributing (PR = contribution, Obsidian model)

1. Add your artifact under the matching canonical source directory:
   - a template -> `templates/<id>.json` (Understand side only; leave Diverge/Converge empty)
   - a persona -> a section in a prompt pack
   - a ruleset -> `rulesets/<id>.yaml` with fixtures under `rulesets/fixtures/`
2. Add an entry to the matching index with a permissive `license` and `source` naming you.
3. Open a PR. CI enforces the drift/validation gates:
   - `templates.json` must list exactly the shipped templates (no orphan or missing entry).
   - every index must be well-formed (a `kind`, a `version`, and `entries` with `id` + `name`).
   - a template's shape, enums, and node references are validated before it can be applied.

No telemetry, no account, no server: the registry is plain files in a public repo, forkable and
diff-friendly. The hosted gallery site is a fast-follow.
