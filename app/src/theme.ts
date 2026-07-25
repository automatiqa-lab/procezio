// The Process Navigator design system, aligned to the ratified UI prototype
// (prototypes/ui-v0.2.html) - decision 0CyrUUF30JEd. Warm parchment canvas on a
// faint graph-paper grid, graphite ink, a single teal-steel accent, amber for the
// two-ink "pencil" (agent, not yet accepted), rust for friction, green for pass.
// Exposed as plain style constants for React inline styles (no CSS framework); the
// @font-face + body grid live in theme.css. IBM Plex is self-hosted (font-src 'self').

export const theme = {
  /** Parchment page background (also set on <body> with the grid, in theme.css). */
  bg: '#F7F6F2',
  /** Panel / nav-rail surface - the calm card tone. */
  surface: '#FBFAF6',
  /** A step up in weight for chips / selected fills. */
  surface2: '#F1EFE7',
  surface3: '#E9E6DB',
  /** Graphite primary ink. */
  text: '#26251F',
  /** Secondary ink (body copy, purposes). */
  text2: '#45443B',
  /** Muted ink (hints, secondary labels). */
  textMuted: '#6B6959',
  /** Faint ink - the mono micro-labels (phase names, zone numbers, session line).
      Darkened from #8B8877: at ~2.8:1 on surface2 the old value was below WCAG AA for
      small text; this stays visually "faint" while clearing 4.5:1 on every surface. */
  textFaint: '#6E6B5B',
  /** Hairline border/divider. */
  border: 'rgba(38, 37, 31, 0.14)',
  /** Stronger hairline (node outlines, dashed rules). */
  border2: 'rgba(38, 37, 31, 0.28)',
  /** Teal-steel accent - active zone, north-star, handoffs, the one green. */
  accent: '#1B7A5C',
  /** Faint accent wash for the selected zone's fill. */
  accentSoft: 'rgba(27, 122, 92, 0.10)',
  /** Text on the accent. */
  onAccent: '#FFFFFF',
  /** Two-ink "pencil": agent-authored, not yet accepted (amber, dashed + flag). */
  pencil: '#A9770F',
  /** Pencil chip fill. */
  pencilSoft: '#F7ECD4',
  /** Friction / waste (rust). */
  friction: '#B4552D',
  /** Pass / cleared (green). */
  pass: '#38855B',
  /** Font stacks - IBM Plex, self-hosted. */
  sans: "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
} as const

export type Theme = typeof theme
