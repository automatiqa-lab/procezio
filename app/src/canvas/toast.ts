// v0.4 - a tiny toast bus. The one-canvas surfaces a lot of transient, honest feedback
// ("Recalculating…", "Commitment logged", "Source tagged"); this is the minimal pub/sub the
// UI publishes to and the ToastHost renders. Module-level, framework-free, no dependency.
//
// Messages are PLAIN TEXT (never HTML) - the host renders them as text, so a message can never
// inject markup (CSP/XSS-safe by construction).

type Listener = (message: string | null) => void

const listeners = new Set<Listener>()
let current: string | null = null

/** Show a toast. Pass null to clear. Auto-clear is the host's concern. */
export function toast(message: string): void {
  current = message
  for (const l of listeners) l(current)
}

export function clearToast(): void {
  current = null
  for (const l of listeners) l(null)
}

export function subscribeToast(l: Listener): () => void {
  listeners.add(l)
  l(current)
  return () => listeners.delete(l)
}
