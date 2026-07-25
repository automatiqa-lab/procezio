// v0.4 PNG-with-embedded-session (spec 01b section 13, Wave 2 H3): a shareable image that IS the
// session. The one-pager PNG is a normal image everywhere; a reopenable .procez/.pnav session is
// appended after the PNG's end-of-file so a viewer displays the picture and Procezio can extract the
// session from the same file. Diff-friendly on its own; carries no secrets (the .pnav never does).
//
// Pure byte functions (no DOM, no network), so the round-trip is unit-tested headlessly. The trick
// is standards-safe: every PNG reader stops at the IEND chunk, so trailing bytes are ignored by
// image viewers; we scan for our own magic marker to recover the session.

const MAGIC = 'PZSESSION1' // marks the start of the appended session block
const enc = new TextEncoder()
const dec = new TextDecoder()

function magicBytes(): Uint8Array {
  return enc.encode(MAGIC)
}

/** Big-endian uint32 -> 4 bytes. */
function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
}
function readU32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
  )
}

function endsWith(bytes: Uint8Array, suffix: Uint8Array): boolean {
  if (bytes.length < suffix.length) return false
  const off = bytes.length - suffix.length
  for (let i = 0; i < suffix.length; i++) if (bytes[off + i] !== suffix[i]) return false
  return true
}

/**
 * Append a session (a .pnav/.procez string) after a PNG's bytes as a TRAILER anchored at the file
 * end: [png][utf8 json][len:u32][MAGIC]. The image is unchanged for any viewer; extract reads from
 * the end, so a session whose text happens to contain the magic bytes cannot confuse recovery.
 */
// The return type is Uint8Array<ArrayBuffer> (not the ArrayBufferLike default): the
// caller feeds it straight into new Blob(...), and TS 5.9's typed-array generics only
// accept ArrayBuffer-backed views as BlobPart. The constructor guarantees it anyway.
export function embedSessionInPng(png: Uint8Array, sessionText: string): Uint8Array<ArrayBuffer> {
  const body = enc.encode(sessionText)
  const magic = magicBytes()
  const out = new Uint8Array(png.length + body.length + 4 + magic.length)
  let o = 0
  out.set(png, o)
  o += png.length
  out.set(body, o)
  o += body.length
  out.set(u32(body.length), o)
  o += 4
  out.set(magic, o)
  return out
}

/**
 * Recover an embedded session from a PNG produced by embedSessionInPng, or null if none is present
 * (a plain PNG, or a truncated/garbled trailer - never throws). Anchored at the file END: the last
 * bytes must be the magic; the u32 before it is the json length; the json is the bytes before that.
 * A re-embed appends a fresh trailer, so the newest session is the one at the end.
 */
export function extractSessionFromPng(bytes: Uint8Array): string | null {
  const magic = magicBytes()
  if (!endsWith(bytes, magic)) return null
  const lenAt = bytes.length - magic.length - 4
  if (lenAt < 0) return null
  const len = readU32(bytes, lenAt)
  const start = lenAt - len
  if (start < 0) return null
  return dec.decode(bytes.subarray(start, start + len))
}
