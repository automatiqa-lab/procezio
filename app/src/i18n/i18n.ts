// Centralized UI strings - English-only, by decision (2026-07-19).
//
// This began as a full locale seam with a German pack and an EN/DE toggle; the product
// call is an English-only interface for now, so the seam is collapsed to one typed
// dictionary with no context, no toggle, and no second pack in the bundle. What is
// deliberately KEPT is the shape: shell surfaces resolve their copy through t(), so
// reintroducing a locale later means adding a pack and a provider - not touching every
// component again. `useT` stays as the component-facing accessor for the same reason.
//
// Pure data + lookup, headless-testable, imports nothing from the DOM.

const STRINGS = {
  'orientation.hint': 'drag to pan · scroll to zoom · click a zone in the rail · ⌘K for commands',
  'start.demo': '▶ Watch the 3-min demo',
  'start.demoHint': 'no key, no setup',
  'start.template': 'Start from a template',
  'mode.guided': 'Guided',
  'mode.express': 'Express',
  'topbar.modelOn': '● model connected',
  'topbar.modelOff': '○ no model · deterministic',
  'topbar.onePager': '↑ One-pager',
  'session.new': '+ New process',
  'session.save': '↓ Save',
  'session.open': '↑ Open',
  'session.png': '↑ PNG',
  'session.unsaved': 'Unsaved changes - save to a file to keep them',
  'restore.title': 'Pick up where you left off?',
  'restore.body':
    'An unsaved session with {n} steps was recovered from this browser. Restore it, or start fresh.',
  'restore.restore': 'Restore session',
  'restore.discard': 'Start fresh',
  'ceremony.eyebrow': 'Sign to commit',
  'ceremony.title': 'Seal these scores',
  'ceremony.body':
    'This is deliberate. Committing writes a record that cannot be quietly undone - and only then does the Challenger wake to test your scores against the evidence.',
  'ceremony.empty': 'No committed ideas yet - score at least one in Prioritize.',
  'ceremony.notYet': 'Not yet',
  'ceremony.sign': 'Sign & commit',
  'challenger.thinking': 'The Challenger is weighing the committed scores…',
  'shoebox.drop': '+ Drop files here or click to add (they stay local)',
  'shoebox.reading': 'Auditor reading…',
  'rail.offRamp':
    'Stop anytime - save your session to a file and pick up where you left off. Roughly 20-30 min end to end.',
  'rail.expressHint':
    'Express: fill in 1 · Frame, let the agent draft the map, and friction, data profiles and ideas auto-populate from it. Re-adjust any element - the business case keeps updating from your changes. Scoring, the commitment and the risk gate stay yours.',
  'smallScreen.notice':
    'Procezio is built for a desktop browser - on a small screen viewing works, but editing is cramped.',
} as const

export type StringKey = keyof typeof STRINGS

/**
 * Resolve one string, substituting {name} vars. A function replacer over a global
 * regex, deliberately: a plain-string replace hits only the FIRST occurrence and
 * interprets $-patterns ($$, $&) inside the VALUE - a user-typed string containing
 * `$&` would inject the raw placeholder back into the copy.
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const s: string = STRINGS[key]
  if (vars === undefined) return s
  return s.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name]
    return v === undefined ? match : String(v)
  })
}

/**
 * The component-facing accessor: `const t = useT()`. Currently a plain passthrough (one
 * locale, no context); kept so call sites are already shaped for a future locale provider.
 */
export function useT(): typeof t {
  return t
}
