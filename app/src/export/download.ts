// Shared file-download plumbing: the one anchor-click download and the one filename slug,
// so every surface that writes a file to the user's disk behaves identically. Browser-only
// and deliberately thin - the CONTENT being downloaded is composed and tested elsewhere
// (onePager.ts, pnav.ts); this module only moves bytes. No network egress: a download
// never leaves the machine.

/**
 * Trigger a browser download of `blob` under `filename` via a temporary anchor. The object
 * URL is revoked on the NEXT tick, not synchronously - some browsers claim the URL
 * asynchronously after the click, and revoking too early can silently drop the file.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has claimed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * A filesystem-safe slug for download filenames: lowercase, runs of non-alphanumerics
 * collapsed to single hyphens, leading/trailing hyphens stripped (so "Q1 draft?" becomes
 * "q1-draft", never "-q1-draft-"). Falls back when nothing survives - an unnamed process
 * must not produce a bare "-one-pager.png".
 */
export function filenameSlug(name: string | undefined, fallback: string): string {
  const s = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s.length > 0 ? s : fallback
}
