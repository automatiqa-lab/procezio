// v0.4 one-pager rasterization (spec 01b section 11, E1): SVG -> PNG / 16:9 slide / PDF, with
// ZERO dependencies and no network. The one-pager is a self-contained SVG (onePager.ts); the
// browser rasterizes it to a canvas (an object URL, same-origin, so the strict CSP is untouched),
// and a minimal single-page PDF embeds the JPEG. No jsPDF, no html-to-image - building this from
// scratch keeps the bundle small and the egress zero (the export never leaves the browser).
//
// This module is browser-only (canvas/Image/URL), so it is not unit-tested; the PURE content it
// renders (composeOnePagerSvg) is covered headlessly. Callers are inside click handlers.

import type { Canvas } from '@procezio/schema'
import {
  composeOnePagerSvg,
  composeFrictionMapSvg,
  composeWalkthroughSvg,
  composeHaccpSvg,
  ONE_PAGER_SIZES,
  type OnePagerSize,
} from './onePager.js'
import {
  countDrafted,
  envelope as disclosureEnvelope,
  pdfInfoEntries,
  reviewStateOf,
  xmp,
} from '@procezio/core'
import type { DisclosureEnvelope } from '@procezio/core'
import { DISCLOSURE } from '../disclosure/disclosure.generated.js'
import { downloadBlob, filenameSlug } from './download.js'
import type { Provenance } from '@procezio/schema'

export type OnePagerFormat = 'png' | 'slide' | 'pdf'

/**
 * Rasterize an SVG string to a canvas of the given pixel size. The SVG travels as a
 * `data:` URL, NOT an object URL: the shipped CSP allows `img-src 'self' data:` and
 * deliberately nothing else, and a blob: image is exactly what it blocks - the object
 * URL this used before failed every export in the production build (the e2e suite
 * opened the popover but never pressed an export button, so only a manual test hit it).
 * Sticking to data: keeps the CSP as tight as it is.
 */
async function svgToCanvas(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const img = new Image()
  img.width = width
  img.height = height
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('one-pager SVG failed to rasterize'))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas 2d context unavailable')
  ctx.fillStyle = '#FBF7EF'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

/** canvas.toBlob as a promise (rejects if the browser returns null). */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      type,
      quality,
    )
  })
}

/** Escape a value for a PDF literal string - the delimiters would otherwise break the dict. */
export const pdfText = (s: string): string => s.replace(/([\\()])/g, '\\$1')

const ascii = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

/**
 * A minimal single-page PDF embedding a JPEG (DCTDecode), hand-written - no library. The page is
 * the image scaled to fit ~A4 width in points; the content stream draws the image full-page.
 */
function jpegToPdf(
  jpeg: Uint8Array,
  imgW: number,
  imgH: number,
  disclosure: DisclosureEnvelope | null = null,
): Uint8Array<ArrayBuffer> {
  const pageW = 595
  const pageH = Math.round((imgH / imgW) * pageW)
  const segments: Uint8Array[] = []
  const offsets: number[] = []
  let pos = 0
  const push = (bytes: Uint8Array): void => {
    segments.push(bytes)
    pos += bytes.length
  }
  const obj = (n: number, body: string): void => {
    offsets[n] = pos
    push(ascii(`${n} 0 obj\n${body}\nendobj\n`))
  }

  // Art. 50(2): the marking rides in the document information dictionary and an XMP
  // packet, so it survives conversion and is detectable without reading the page. Both
  // objects exist only when the canvas actually contains agent-drafted content.
  const infoEntries = pdfInfoEntries(disclosure)
  const xmpPacket = xmp(disclosure)
  const infoNum = infoEntries.length > 0 ? 6 : 0
  const metaNum = xmpPacket !== '' ? (infoNum > 0 ? 7 : 6) : 0
  const lastObj = Math.max(5, infoNum, metaNum)
  const xrefSize = lastObj + 1

  push(ascii('%PDF-1.4\n'))
  obj(1, `<< /Type /Catalog /Pages 2 0 R${metaNum > 0 ? ` /Metadata ${metaNum} 0 R` : ''} >>`)
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  )
  // Image XObject: header, then raw JPEG bytes, then the stream tail.
  offsets[4] = pos
  push(
    ascii(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    ),
  )
  push(jpeg)
  push(ascii('\nendstream\nendobj\n'))
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}endstream`)

  if (infoNum > 0) {
    const body = infoEntries.map(([k, v]) => `/${k} (${pdfText(v)})`).join(' ')
    obj(infoNum, `<< /Producer (Procezio) /Creator (Procezio) ${body} >>`)
  }
  if (metaNum > 0) {
    // XMP as a plain unfiltered stream, so any reader can lift it out.
    offsets[metaNum] = pos
    push(
      ascii(
        `${metaNum} 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${xmpPacket.length} >>\nstream\n`,
      ),
    )
    push(ascii(xmpPacket))
    push(ascii('\nendstream\nendobj\n'))
  }

  const xrefPos = pos
  let xref = `xref\n0 ${xrefSize}\n0000000000 65535 f \n`
  for (let n = 1; n <= lastObj; n++)
    xref += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`
  push(ascii(xref))
  push(
    ascii(
      `trailer\n<< /Size ${xrefSize} /Root 1 0 R${infoNum > 0 ? ` /Info ${infoNum} 0 R` : ''} >>\nstartxref\n${xrefPos}\n%%EOF\n`,
    ),
  )

  const total = segments.reduce((s, seg) => s + seg.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const seg of segments) {
    out.set(seg, o)
    o += seg.length
  }
  return out
}

/**
 * The Art. 50 envelope for an export, or null when the agent wrote nothing. Counts come
 * from the two-ink provenance the store already projects, so nothing new is tracked, and
 * `model` is deliberately never set: the endpoint is the user's own.
 */
function exportDisclosure(provenance?: ReadonlyMap<string, Provenance>): DisclosureEnvelope | null {
  const counts = countDrafted(provenance)
  return disclosureEnvelope({
    system: DISCLOSURE.system,
    scope: DISCLOSURE.scope,
    drafted: counts.items_drafted,
    total: counts.items_total,
    reviewState: reviewStateOf(counts),
  })
}

/** The export filename prefix: the sluggified process name (shared plumbing, download.ts). */
const stampOf = (canvas: Canvas): string => filenameSlug(canvas.process?.name, 'process')

/**
 * Compose and download the one-pager in the requested format. PNG and the 16:9 slide are direct
 * canvas exports; the PDF embeds a JPEG of the sheet. Everything happens in the browser - nothing
 * is uploaded. Returns the filename written.
 */
export async function exportOnePager(
  canvas: Canvas,
  format: OnePagerFormat,
  provenance?: ReadonlyMap<string, Provenance>,
): Promise<string> {
  const size: OnePagerSize = format === 'slide' ? 'slide' : 'sheet'
  const { width, height } = ONE_PAGER_SIZES[size]
  const rendered = await svgToCanvas(composeOnePagerSvg(canvas, size, provenance), width, height)
  const stamp = stampOf(canvas)

  if (format === 'pdf') {
    const jpegBlob = await canvasToBlob(rendered, 'image/jpeg', 0.92)
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())
    const pdf = jpegToPdf(jpegBytes, width, height, exportDisclosure(provenance))
    downloadBlob(`${stamp}-one-pager.pdf`, new Blob([pdf], { type: 'application/pdf' }))
    return `${stamp}-one-pager.pdf`
  }
  const blob = await canvasToBlob(rendered, 'image/png')
  const name = `${stamp}-one-pager${format === 'slide' ? '-16x9' : ''}.png`
  downloadBlob(name, blob)
  return name
}

/**
 * Export the one-pager PNG with a reopenable session appended (spec H3): the image displays
 * everywhere, and Procezio can recover the session from the same file. `sessionText` is the
 * serialized .pnav/.procez. Browser-only, zero egress.
 */
export async function exportOnePagerWithSession(
  canvas: Canvas,
  sessionText: string,
  provenance?: ReadonlyMap<string, Provenance>,
): Promise<string> {
  const { embedSessionInPng } = await import('./embed.js')
  const { width, height } = ONE_PAGER_SIZES.sheet
  const rendered = await svgToCanvas(composeOnePagerSvg(canvas, 'sheet', provenance), width, height)
  const blob = await canvasToBlob(rendered, 'image/png')
  const png = new Uint8Array(await blob.arrayBuffer())
  const withSession = embedSessionInPng(png, sessionText)
  const name = `${stampOf(canvas)}-one-pager-session.png`
  downloadBlob(name, new Blob([withSession], { type: 'image/png' }))
  return name
}

/**
 * Compose, rasterize and download one sheet-sized PNG (`<stamp>-<suffix>.png`). The three
 * checkpoint sheets below differ only in the SVG composer and the filename suffix.
 */
async function exportSheet(
  canvas: Canvas,
  compose: (canvas: Canvas) => string,
  suffix: string,
): Promise<string> {
  const { width, height } = ONE_PAGER_SIZES.sheet
  const rendered = await svgToCanvas(compose(canvas), width, height)
  const blob = await canvasToBlob(rendered, 'image/png')
  const name = `${stampOf(canvas)}-${suffix}.png`
  downloadBlob(name, blob)
  return name
}

/**
 * Export the Understand-phase friction-map checkpoint (spec E5) as a PNG. Value before the case
 * is complete; the caller logs the checkpoint.exported event. Browser-only, zero egress.
 */
export function exportFrictionMapCheckpoint(
  canvas: Canvas,
  provenance?: ReadonlyMap<string, Provenance>,
): Promise<string> {
  return exportSheet(canvas, (c) => composeFrictionMapSvg(c, provenance), 'friction-map')
}

/**
 * Export the doer-verification walk-through sheet (spec D6) as a PNG to print and hand to the
 * person who does the work. Browser-only, zero egress.
 */
export function exportWalkthrough(canvas: Canvas): Promise<string> {
  return exportSheet(canvas, composeWalkthroughSvg, 'walkthrough')
}

/**
 * Export the HACCP risk worksheet (spec F6) as a PNG: hazards seeded from the map's risk deck, the
 * control/limit/monitoring/corrective columns blank for the team. Browser-only, zero egress.
 */
export function exportHaccp(canvas: Canvas): Promise<string> {
  return exportSheet(canvas, composeHaccpSvg, 'haccp')
}
