# templates/

The starting canvases, as versioned artifacts.

Each JSON file here is a ready-made process canvas a user can open instead of starting from an empty
board. They are content, not code: the shape they must satisfy is the ratified canvas schema, and
`ci:templates-drift` regenerates `app/src/templates/templates.generated.ts` from them and fails the
build if the two diverge. The generated module is never edited by hand.

`registry/` indexes what ships, and `ci:registry-drift` checks that the index and the files here
agree - so a template added without being registered, or registered without existing, fails CI
rather than surfacing as a broken menu entry.

Adding one means an amendment PR like any other ratified artifact, since a template encodes
methodology rather than preference.
