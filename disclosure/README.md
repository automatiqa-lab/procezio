# disclosure/

The EU AI Act Article 50 wording, as a ratified artifact.

`disclosure.yaml` holds what Procezio says about AI-generated content: the session notice, the line
that goes on an exported sheet when the agent drafted part of it, and the empty string that is
deliberately used when it drafted nothing. Nothing else in the codebase may hardcode those strings.

It is authored here and **generated** into `app/src/disclosure/disclosure.generated.ts`, because the
browser cannot parse YAML under the strict Solo CSP. `ci:disclosure-drift` keeps the two in lockstep
and fails the build if they diverge, so the generated file is never edited by hand.

The gate enforces two invariants that a typo would otherwise break silently:

- `wording.none` must stay empty. A canvas the agent never touched exports no line at all, and the
  absence of a marking has to remain a truthful claim.
- No visible string may interpolate a model name. Article 50 asks you to disclose *that* content is
  AI-generated, not which system produced it, and the endpoint here is the user's own.

Changes go through an amendment PR like any other ratified artifact - this wording carries a legal
claim, so it should not move by drive-by commit. Canonical upstream is the lab's shared wording
file; change it there first, then propagate on the next release.

See [COMPLIANCE.md](../COMPLIANCE.md) for the role classification and the Annex III screening.
