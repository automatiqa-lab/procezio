// v0.4 one-pager composition (spec 01b section 11, E1): the shareable improvement case.
//
// The one-pager is composed as a self-contained SVG string from real canvas state - no external
// resources, so it renders under the strict CSP and serializes to PNG/PDF with zero dependencies
// (render.ts does the browser-side rasterization). This module is PURE (canvas -> string), so the
// content is unit-tested headlessly. It invents nothing: the credibility header, north-star, top
// opportunities, The Ask, and the ledger annex are all read from the canvas; a missing field is
// shown as missing, never filled.

import type { Canvas } from '@procezio/schema'
import {
  credibilityLadder,
  cycleTimeEstimate,
  formatDuration,
  handoffCount,
  riskPrompts,
} from '@procezio/core'
import type { Provenance } from '@procezio/schema'
import { sourceOptions } from '../case/events.js'
import { countDrafted, documentLine } from '@procezio/core'
import { DISCLOSURE_WORDING } from '../disclosure/disclosure.generated.js'
import { DOWNTIME_LABELS } from '../friction/events.js'
import { GATE_CHECKS } from '../gate/events.js'
import { clearedChecks } from '../case/model.js'
import { nodeLabel } from '../nodeLabel.js'

/** Page presets: a portrait sheet and a 16:9 slide (spec E1). Units are pixels at export scale. */
export const ONE_PAGER_SIZES = {
  sheet: { width: 1200, height: 1500 },
  slide: { width: 1280, height: 720 },
} as const

export type OnePagerSize = keyof typeof ONE_PAGER_SIZES

/** The fixed section labels. Field values come from the canvas, unchanged. */
const LABELS: Record<string, string> = {
  banner: 'PROCESS IMPROVEMENT CASE',
  credibility: 'Credibility',
  figures: 'figures',
  verified: 'verified',
  assumed: 'assumed',
  northStar: 'NORTH-STAR',
  opportunities: 'TOP OPPORTUNITIES',
  none: 'None committed yet.',
  ask: 'THE ASK',
  askEmpty: 'Commit an idea to name the ask.',
  approve: 'Approve',
  owner: 'Owner',
  ownerEmpty: 'Owner: name the process owner in Frame.',
  ledger: 'LEDGER ANNEX - ASSUMPTIONS',
  ledgerEmpty: 'No open assumptions.',
  decisions: 'DECISION JOURNAL',
  snapshot: 'PROCESS SNAPSHOT',
  friction: 'WHERE IT HURTS',
  numbers: 'THE NUMBERS',
  costs: 'COSTS',
  benefits: 'BENEFITS',
  numbersEmpty: 'No case figures yet - the Improvement case (Zone 8) drafts them from your canvas.',
  gateCleared: 'Risk gate: all checks cleared',
  footer: 'made with Procezio · figures trace to the canvas · export credibility',
}

/** XML-escape a string for safe inclusion in SVG text. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The EU AI Act Art. 50 line, sitting under the "made with Procezio" footer. Conditional
 * by construction: a canvas the agent never touched exports exactly as it did before, so
 * the ABSENCE of this line stays a truthful claim. The model is never named - Art. 50
 * asks for disclosure THAT content is AI-generated, and the endpoint is the user's own.
 */
function disclosureLine(
  pad: number,
  height: number,
  muted: string,
  provenance?: ReadonlyMap<string, Provenance>,
): string[] {
  const counts = countDrafted(provenance)
  const text = documentLine(counts, DISCLOSURE_WORDING, counts.pending)
  if (text === '') return []
  return [`<text x="${pad}" y="${height - 16}" font-size="11" fill="${muted}">${esc(text)}</text>`]
}

/** Truncate to a rough character budget so a long label cannot overflow the sheet. */
function clip(s: string, max: number): string {
  const t = s.trim()
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…'
}

/** The structured model behind the one-pager - the honest read of the canvas. */
export interface OnePagerModel {
  processName: string
  northStar: string
  credibility: { level: number; label: string; claim: string }
  figures: number
  verified: number
  assumed: number
  /** Unconfirmed simulated-perspective count (E2): shown so a reader weighs rehearsal vs fact. */
  simulated: number
  /** One-line process snapshot: what was mapped, and what the map says about time. */
  snapshot: string[]
  topOpportunities: Array<{ title: string; score?: string }>
  /** Risk-gate progress for the committed opportunity, or null when nothing is committed. */
  gate: { cleared: number; total: number } | null
  /** The loudest friction, humanized, each pinned to its step. */
  frictionTop: Array<{ label: string; step: string }>
  /** THE NUMBERS - the case's own cost/benefit figures, each with its resolved source. */
  caseFigures: Array<{
    label: string
    value: string
    kind: 'cost' | 'benefit'
    benefitClass?: string
    source: string
  }>
  ask: { what: string; owner: string }
  ledger: Array<{ statement: string; confidence: string; verifyBy?: string; evidence?: string }>
  /** The decision journal (G3): triaged ideas with the reason they landed where they did. */
  decisions: Array<{ title: string; triage: string; reason: string }>
}

/** Read the one-pager model from the canvas. No number or field is invented. When
 * `provenance` is given, pencil (unreviewed agent) evidence does not raise the
 * credibility chip - the exported claim only covers what the human confirmed. */
export function onePagerModel(
  canvas: Canvas,
  provenance?: ReadonlyMap<string, Provenance>,
): OnePagerModel {
  const cred = credibilityLadder(canvas, provenance)
  const assumptions = canvas.assumptions ?? []
  const verified = assumptions.filter((a) => a.confidence === 'high').length
  const figures = (canvas.cases ?? []).flatMap((c) => c.figures ?? []).length
  const opps = (canvas.opportunities ?? []).filter(
    (o) => o.committed === true || o.triage === 'Now',
  )
  const topOpportunities = opps.slice(0, 4).map((o) => ({
    title: o.title,
    ...(o.score ? { score: `benefit ${o.score.benefit} / effort ${o.score.effort}` } : {}),
  }))
  const committed = (canvas.opportunities ?? []).find((o) => o.committed === true)

  // Process snapshot: what was mapped and what the map says about time. Only real
  // parts are shown - a missing field is missing, never filled.
  const steps = canvas.nodes.filter((n) => n.type === 'Step').length
  const handoffs = handoffCount(canvas)
  const ct = cycleTimeEstimate(canvas)
  const snapshot: string[] = []
  if (canvas.nodes.length > 0) snapshot.push(`${canvas.nodes.length} nodes (${steps} steps)`)
  if (handoffs > 0) snapshot.push(`${handoffs} handoff${handoffs === 1 ? '' : 's'}`)
  if (canvas.process?.volume?.trim()) snapshot.push(`volume ${canvas.process.volume.trim()}`)
  if (canvas.process?.touch_time?.trim()) snapshot.push(`touch ${canvas.process.touch_time.trim()}`)
  if (ct.counted > 0) {
    snapshot.push(
      `est. cycle ${formatDuration(ct.total_minutes)} from the map${ct.biggest_wait ? ` (biggest wait: ${ct.biggest_wait.label})` : ''}`,
    )
  }

  // The loudest friction, humanized (display labels), pinned to its step's name.
  const stepById = new Map(canvas.nodes.map((n) => [n.id, n]))
  const frictionTop = (canvas.friction ?? []).slice(0, 4).map((f) => {
    const node = stepById.get(f.node_id)
    return {
      label: DOWNTIME_LABELS[f.waste] ?? f.waste,
      step: node !== undefined ? nodeLabel(node) : f.node_id,
    }
  })

  // THE NUMBERS: the case figures themselves (committed opportunities' cases first),
  // each source_ref resolved to the human label of the canvas element it cites.
  const labelById = new Map(sourceOptions(canvas).map((s) => [s.id, s.label]))
  const committedIds = new Set(
    (canvas.opportunities ?? []).filter((o) => o.committed === true).map((o) => o.id),
  )
  const orderedCases = [...(canvas.cases ?? [])].sort(
    (a, b) =>
      Number(committedIds.has(b.opportunity_id)) - Number(committedIds.has(a.opportunity_id)),
  )
  const caseFigures = orderedCases
    .flatMap((c) => c.figures ?? [])
    .slice(0, 8)
    .map((f) => ({
      label: f.label,
      value: f.value,
      kind: f.kind ?? 'benefit',
      ...(f.benefit_class !== undefined ? { benefitClass: f.benefit_class } : {}),
      source: labelById.get(f.source_ref) ?? f.source_ref,
    }))

  return {
    processName: canvas.process?.name ?? 'Untitled process',
    northStar: canvas.process?.north_star ?? '',
    credibility: { level: cred.level, label: cred.label, claim: cred.claim },
    figures,
    verified,
    assumed: assumptions.length - verified,
    simulated: (canvas.simulated_perspectives ?? []).filter((s) => s.confirmed !== true).length,
    snapshot,
    topOpportunities,
    gate:
      committed !== undefined
        ? { cleared: clearedChecks(canvas, committed.id), total: GATE_CHECKS.length }
        : null,
    frictionTop,
    caseFigures,
    ask: {
      what: committed?.title ?? topOpportunities[0]?.title ?? '',
      owner: canvas.process?.owner ?? '',
    },
    ledger: assumptions.slice(0, 6).map((a) => ({
      statement: a.statement,
      confidence: a.confidence,
      ...(a.verify_by !== undefined && a.verify_by.trim() !== '' ? { verifyBy: a.verify_by } : {}),
      ...(a.evidence !== undefined && a.evidence.trim() !== '' ? { evidence: a.evidence } : {}),
    })),
    decisions: (canvas.opportunities ?? [])
      .filter((o) => o.triage !== undefined && (o.triage_reason ?? '').trim() !== '')
      .slice(0, 5)
      .map((o) => ({ title: o.title, triage: o.triage!, reason: o.triage_reason! })),
  }
}

/**
 * Compose the one-pager SVG from the canvas at the given size. Self-contained (system fonts, no
 * external refs) so it rasterizes under the CSP. The layout is deliberately simple and fixed -
 * a header band, the credibility chip, north-star, top opportunities, The Ask, and the ledger
 * annex, with "made with Procezio" in the footer.
 */
export function composeOnePagerSvg(
  canvas: Canvas,
  size: OnePagerSize = 'sheet',
  provenance?: ReadonlyMap<string, Provenance>,
): string {
  const { width, height } = ONE_PAGER_SIZES[size]
  const m = onePagerModel(canvas, provenance)
  const L = LABELS
  const pad = 56
  const font =
    "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  const gold = '#A9770F'
  const ink = '#23201B'
  const muted = '#6B6459'
  const line: string[] = []

  line.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}">`,
  )
  line.push(`<rect width="${width}" height="${height}" fill="#FBF7EF"/>`)
  line.push(`<rect x="0" y="0" width="${width}" height="12" fill="${gold}"/>`)

  let y = pad + 28
  line.push(
    `<text x="${pad}" y="${y}" font-size="15" letter-spacing="2" fill="${gold}" font-weight="700">${L.banner}</text>`,
  )
  y += 44
  line.push(
    `<text x="${pad}" y="${y}" font-size="34" font-weight="700" fill="${ink}">${esc(clip(m.processName, 46))}</text>`,
  )

  // Credibility header (leads, per spec E1).
  y += 40
  line.push(
    `<text x="${pad}" y="${y}" font-size="16" fill="${muted}">${L.credibility} L${m.credibility.level} - ${esc(clip(m.credibility.label, 36))} · ${m.figures} ${L.figures} · ${m.verified} ${L.verified} · ${m.assumed} ${L.assumed}${m.simulated > 0 ? ` · ${m.simulated} simulated` : ''}</text>`,
  )
  y += 26
  line.push(
    `<text x="${pad}" y="${y}" font-size="14" fill="${muted}">${esc(clip(m.credibility.claim, 92))}</text>`,
  )

  const pass = '#38855B'
  const rust = '#B4552D'

  // North-star.
  if (m.northStar) {
    y += 46
    line.push(
      `<text x="${pad}" y="${y}" font-size="13" letter-spacing="1" fill="${gold}">${L.northStar}</text>`,
    )
    y += 26
    line.push(
      `<text x="${pad}" y="${y}" font-size="19" fill="${ink}">${esc(clip(m.northStar, 74))}</text>`,
    )
  }

  // Process snapshot: what was mapped, and what the map says about time (sheet only -
  // the slide is a summary with a fixed 720px budget). Wraps to a second line at a
  // part boundary instead of truncating mid-sentence.
  if (size === 'sheet' && m.snapshot.length > 0) {
    y += 42
    line.push(
      `<text x="${pad}" y="${y}" font-size="13" letter-spacing="1" fill="${gold}">${L.snapshot}</text>`,
    )
    const rows: string[][] = [[]]
    let len = 0
    for (const part of m.snapshot) {
      if (len > 0 && len + part.length > 96) {
        rows.push([])
        len = 0
      }
      rows[rows.length - 1]!.push(part)
      len += part.length + 3
    }
    for (const row of rows.slice(0, 2)) {
      y += 24
      line.push(
        `<text x="${pad}" y="${y}" font-size="14" fill="${ink}">${esc(clip(row.join(' · '), 120))}</text>`,
      )
    }
  }

  // Where it hurts: the loudest friction, humanized, pinned to its step (sheet only).
  if (size === 'sheet' && m.frictionTop.length > 0) {
    y += 42
    line.push(
      `<text x="${pad}" y="${y}" font-size="13" letter-spacing="1" fill="${gold}">${L.friction}</text>`,
    )
    for (const f of m.frictionTop) {
      y += 25
      line.push(
        `<text x="${pad}" y="${y}" font-size="14" fill="${ink}">- ${esc(clip(f.label, 34))} <tspan fill="${muted}">at ${esc(clip(f.step, 52))}</tspan></text>`,
      )
    }
  }

  // Top opportunities, with the risk-gate verdict for the committed one.
  y += 44
  line.push(
    `<text x="${pad}" y="${y}" font-size="13" letter-spacing="1" fill="${gold}">${L.opportunities}</text>`,
  )
  if (m.topOpportunities.length === 0) {
    y += 26
    line.push(`<text x="${pad}" y="${y}" font-size="15" fill="${muted}">${L.none}</text>`)
  } else {
    for (const o of m.topOpportunities.slice(0, size === 'slide' ? 3 : 4)) {
      y += 30
      line.push(
        `<text x="${pad}" y="${y}" font-size="16" fill="${ink}">• ${esc(clip(o.title, 58))}${o.score ? `  <tspan fill="${muted}" font-size="13">(${esc(o.score)})</tspan>` : ''}</text>`,
      )
    }
  }
  if (m.gate !== null) {
    y += 28
    const open = m.gate.total - m.gate.cleared
    line.push(
      open === 0
        ? `<text x="${pad}" y="${y}" font-size="14" fill="${pass}" font-weight="600">✓ ${L.gateCleared} (${m.gate.cleared}/${m.gate.total})</text>`
        : `<text x="${pad}" y="${y}" font-size="14" fill="${rust}" font-weight="600">Risk gate: ${open} of ${m.gate.total} checks still open - provisional</text>`,
    )
  }

  // THE NUMBERS - the case's own figures, costs left, benefits right, each with its
  // resolved canvas source (the iron traceability rule, made visible to the reader).
  // The slide gets a one-line strip instead of the two columns (fixed 720px budget).
  if (size === 'slide') {
    if (m.caseFigures.length > 0) {
      y += 42
      line.push(
        `<text x="${pad}" y="${y}" font-size="13" letter-spacing="1" fill="${gold}">${L.numbers}</text>`,
      )
      y += 27
      const strip = m.caseFigures
        .slice(0, 3)
        .map((f) => `${clip(f.value, 20)} - ${clip(f.label, 26)}`)
        .join('   ·   ')
      line.push(`<text x="${pad}" y="${y}" font-size="15" fill="${ink}">${esc(strip)}</text>`)
    }
  } else {
    y += 44
    line.push(
      `<text x="${pad}" y="${y}" font-size="13" letter-spacing="1" fill="${gold}">${L.numbers}</text>`,
    )
    if (m.caseFigures.length === 0) {
      y += 26
      line.push(`<text x="${pad}" y="${y}" font-size="14" fill="${muted}">${L.numbersEmpty}</text>`)
    } else {
      const costs = m.caseFigures.filter((f) => f.kind === 'cost')
      const benefits = m.caseFigures.filter((f) => f.kind === 'benefit')
      const colW = (width - pad * 2 - 28) / 2
      const colX: [number, number] = [pad, pad + colW + 28]
      const cols: Array<[string, typeof costs, string]> = [
        [L.costs ?? 'COSTS', costs, rust],
        [L.benefits ?? 'BENEFITS', benefits, pass],
      ]
      y += 28
      const headY = y
      let maxY = y
      cols.forEach(([title, figures, color], i) => {
        const x = colX[i] as number
        let cy = headY
        line.push(
          `<text x="${x}" y="${cy}" font-size="12" letter-spacing="1" fill="${color}" font-weight="700">${esc(title)}</text>`,
        )
        if (figures.length === 0) {
          cy += 24
          line.push(`<text x="${x}" y="${cy}" font-size="13" fill="${muted}">-</text>`)
        }
        for (const f of figures.slice(0, 4)) {
          cy += 30
          line.push(
            `<text x="${x}" y="${cy}" font-size="17" font-weight="700" fill="${ink}">${esc(clip(f.value, 26))}</text>`,
          )
          cy += 20
          line.push(
            `<text x="${x}" y="${cy}" font-size="13.5" fill="${ink}">${esc(clip(f.label, 44))}${f.benefitClass ? ` <tspan fill="${muted}" font-size="11.5">[${esc(f.benefitClass)}]</tspan>` : ''}</text>`,
          )
          cy += 18
          line.push(
            `<text x="${x}" y="${cy}" font-size="12" fill="${muted}">from: ${esc(clip(f.source, 56))}</text>`,
          )
        }
        if (cy > maxY) maxY = cy
      })
      y = maxY
    }
  }

  // The Ask (spec E1: approve what, from whom).
  y += 50
  const askH = 96
  line.push(
    `<rect x="${pad}" y="${y - 22}" width="${width - pad * 2}" height="${askH}" rx="10" fill="#F3ECDB" stroke="${gold}" stroke-width="1.5"/>`,
  )
  line.push(
    `<text x="${pad + 18}" y="${y + 4}" font-size="13" letter-spacing="1" fill="${gold}">${L.ask}</text>`,
  )
  line.push(
    `<text x="${pad + 18}" y="${y + 34}" font-size="18" fill="${ink}">${m.ask.what ? `${L.approve}: ${esc(clip(m.ask.what, 58))}` : L.askEmpty}</text>`,
  )
  line.push(
    `<text x="${pad + 18}" y="${y + 60}" font-size="15" fill="${muted}">${m.ask.owner ? `${L.owner}: ${esc(clip(m.ask.owner, 50))}` : L.ownerEmpty}</text>`,
  )
  y += askH

  // Ledger annex (portrait sheet only - the slide is a summary).
  if (size === 'sheet') {
    y += 30
    line.push(
      `<text x="${pad}" y="${y}" font-size="13" letter-spacing="1" fill="${gold}">${L.ledger}</text>`,
    )
    if (m.ledger.length === 0) {
      y += 26
      line.push(`<text x="${pad}" y="${y}" font-size="14" fill="${muted}">${L.ledgerEmpty}</text>`)
    } else {
      for (const a of m.ledger) {
        if (y > height - 130) break // never run into the footer
        y += 26
        line.push(
          `<text x="${pad}" y="${y}" font-size="14" fill="${ink}">- ${esc(clip(a.statement, 72))} <tspan fill="${muted}">[${esc(a.confidence)}]</tspan>${a.evidence ? ` <tspan fill="${pass}" font-size="12">📎</tspan>` : ''}</text>`,
        )
        if (a.verifyBy) {
          y += 19
          line.push(
            `<text x="${pad + 16}" y="${y}" font-size="12" fill="${muted}">verify: ${esc(clip(a.verifyBy, 84))}</text>`,
          )
        }
      }
    }

    // Decision journal (G3): why each triaged idea landed where it did.
    if (m.decisions.length > 0 && y < height - 150) {
      y += 34
      line.push(
        `<text x="${pad}" y="${y}" font-size="13" letter-spacing="1" fill="${gold}">${L.decisions}</text>`,
      )
      for (const d of m.decisions) {
        if (y > height - 110) break
        y += 24
        line.push(
          `<text x="${pad}" y="${y}" font-size="13.5" fill="${ink}">- ${esc(clip(d.title, 38))} <tspan fill="${muted}">[${esc(d.triage)}]</tspan> ${esc(clip(d.reason, 62))}</text>`,
        )
      }
    }
  }

  line.push(
    `<text x="${pad}" y="${height - 34}" font-size="13" fill="${muted}">${L.footer} L${m.credibility.level}</text>`,
  )
  line.push(...disclosureLine(pad, height, muted, provenance))
  line.push(`</svg>`)
  return line.join('\n')
}

/**
 * Compose the Understand-phase checkpoint (spec E5): a friction-map snapshot - the process name,
 * its steps, and the friction pinned to each - delivered before the case is complete. Self-
 * contained SVG, same rasterization path as the one-pager.
 */
export function composeFrictionMapSvg(
  canvas: Canvas,
  provenance?: ReadonlyMap<string, Provenance>,
): string {
  const { width, height } = ONE_PAGER_SIZES.sheet
  const L = LABELS
  const gold = '#A9770F'
  const ink = '#23201B'
  const muted = '#6B6459'
  const pad = 56
  const font =
    "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  const name = canvas.process?.name ?? 'Untitled process'
  const steps = canvas.nodes.filter((n) => n.type === 'Step' || n.type === 'Wait')
  const frictionFor = (nodeId: string): string[] =>
    (canvas.friction ?? []).filter((f) => f.node_id === nodeId).map((f) => f.note ?? f.waste)

  const line: string[] = []
  line.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}">`,
  )
  line.push(`<rect width="${width}" height="${height}" fill="#FBF7EF"/>`)
  line.push(`<rect x="0" y="0" width="${width}" height="12" fill="${gold}"/>`)
  let y = pad + 28
  line.push(
    `<text x="${pad}" y="${y}" font-size="15" letter-spacing="2" fill="${gold}" font-weight="700">CHECKPOINT - FRICTION MAP</text>`,
  )
  y += 42
  line.push(
    `<text x="${pad}" y="${y}" font-size="30" font-weight="700" fill="${ink}">${esc(clip(name, 46))}</text>`,
  )
  y += 20
  for (const s of steps) {
    y += 32
    line.push(
      `<text x="${pad}" y="${y}" font-size="16" fill="${ink}">• ${esc(clip(s.label || s.id, 52))}</text>`,
    )
    for (const fr of frictionFor(s.id)) {
      y += 24
      line.push(
        `<text x="${pad + 22}" y="${y}" font-size="13.5" fill="${muted}">- ${esc(clip(fr, 78))}</text>`,
      )
    }
    if (y > height - 90) break
  }
  line.push(
    `<text x="${pad}" y="${height - 34}" font-size="13" fill="${muted}">${L.footer} L${credibilityLadder(canvas, provenance).level}</text>`,
  )
  line.push(...disclosureLine(pad, height, muted, provenance))
  line.push(`</svg>`)
  return line.join('\n')
}

/**
 * Compose the doer-verification walk-through sheet (spec D6): a printable sheet listing the mapped
 * steps grouped by lane (owner), each with a confirm/correct box for the person who actually does
 * the work to mark up on paper. Their corrections come back as ordinary edits (ink, doer as
 * source). Self-contained SVG, same rasterization path as the one-pager.
 */
export function composeWalkthroughSvg(canvas: Canvas): string {
  const { width, height } = ONE_PAGER_SIZES.sheet
  const gold = '#A9770F'
  const ink = '#23201B'
  const muted = '#6B6459'
  const pad = 56
  const font =
    "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  const name = canvas.process?.name ?? 'Untitled process'
  // Group nodes by lane, using the lane's actor label where known.
  const laneActor = new Map((canvas.lanes ?? []).map((l) => [l.id, l.actor]))
  const byLane = new Map<string, typeof canvas.nodes>()
  for (const n of canvas.nodes) {
    const list = byLane.get(n.lane) ?? []
    list.push(n)
    byLane.set(n.lane, list)
  }

  const line: string[] = []
  line.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}">`,
  )
  line.push(`<rect width="${width}" height="${height}" fill="#FBF7EF"/>`)
  line.push(`<rect x="0" y="0" width="${width}" height="12" fill="${gold}"/>`)
  let y = pad + 26
  line.push(
    `<text x="${pad}" y="${y}" font-size="15" letter-spacing="2" fill="${gold}" font-weight="700">WALK-THROUGH SHEET (FOR THE DOER)</text>`,
  )
  y += 40
  line.push(
    `<text x="${pad}" y="${y}" font-size="28" font-weight="700" fill="${ink}">${esc(clip(name, 46))}</text>`,
  )
  y += 24
  line.push(
    `<text x="${pad}" y="${y}" font-size="13" fill="${muted}">For each step: is it right? If not, correct it - your correction counts as evidence.</text>`,
  )
  for (const [laneId, nodes] of byLane) {
    if (y > height - 120) break
    y += 34
    line.push(
      `<text x="${pad}" y="${y}" font-size="13" letter-spacing="1" fill="${gold}">${esc(clip((laneActor.get(laneId) ?? laneId).toUpperCase(), 48))}</text>`,
    )
    for (const n of nodes) {
      if (y > height - 90) break
      y += 30
      // A small confirm/correct box, then the step.
      line.push(
        `<rect x="${pad}" y="${y - 12}" width="15" height="15" rx="3" fill="none" stroke="${muted}"/>`,
      )
      line.push(
        `<text x="${pad + 26}" y="${y}" font-size="15" fill="${ink}">${esc(clip(n.label || n.id, 56))} <tspan fill="${muted}" font-size="11">(${n.type})</tspan></text>`,
      )
    }
  }
  line.push(
    `<text x="${pad}" y="${height - 34}" font-size="12" fill="${muted}">made with Procezio · the doer’s corrections land as ink, with the doer as source</text>`,
  )
  line.push(`</svg>`)
  return line.join('\n')
}

/**
 * Compose a HACCP-structured risk worksheet (spec F6): a printable grid, one row per risky step,
 * with the HAZARD pre-filled from the deterministic risk deck (F7) and the control / critical limit
 * / monitoring / corrective-action columns left blank for the team to complete. Ships as an
 * artifact, not a gate change. Self-contained SVG, same rasterization path as the one-pager.
 */
export function composeHaccpSvg(canvas: Canvas): string {
  const { width, height } = ONE_PAGER_SIZES.sheet
  const gold = '#A9770F'
  const ink = '#23201B'
  const muted = '#6B6459'
  const pad = 40
  const font =
    "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  const name = canvas.process?.name ?? 'Untitled process'
  const labelFor = new Map((canvas.nodes ?? []).map((n) => [n.id, n.label || n.id]))
  // One row per risky step (hazard seeded from the risk deck); fall back to the mapped steps.
  const prompts = riskPrompts(canvas)
  const rows =
    prompts.length > 0
      ? prompts.map((p) => ({ step: p.label, hazard: p.prompt }))
      : (canvas.nodes ?? [])
          .filter((n) => n.type === 'Step' || n.type === 'Wait')
          .map((n) => ({ step: labelFor.get(n.id) ?? n.id, hazard: '' }))

  const cols = ['Step', 'Hazard', 'Control', 'Limit', 'Monitoring', 'Corrective']
  const x0 = pad
  const gridW = width - pad * 2
  const cw = gridW / cols.length
  const line: string[] = []
  line.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}">`,
  )
  line.push(`<rect width="${width}" height="${height}" fill="#FBF7EF"/>`)
  line.push(`<rect x="0" y="0" width="${width}" height="12" fill="${gold}"/>`)
  let y = pad + 24
  line.push(
    `<text x="${x0}" y="${y}" font-size="15" letter-spacing="2" fill="${gold}" font-weight="700">HACCP RISK WORKSHEET</text>`,
  )
  y += 34
  line.push(
    `<text x="${x0}" y="${y}" font-size="24" font-weight="700" fill="${ink}">${esc(clip(name, 52))}</text>`,
  )
  y += 28
  // Header row.
  const headY = y
  cols.forEach((c, i) => {
    line.push(
      `<text x="${x0 + i * cw + 6}" y="${headY}" font-size="12" font-weight="700" fill="${gold}">${c}</text>`,
    )
  })
  y += 8
  line.push(`<line x1="${x0}" y1="${y}" x2="${x0 + gridW}" y2="${y}" stroke="${muted}"/>`)
  const rowH = 62
  for (const r of rows) {
    if (y + rowH > height - 40) break
    const top = y
    y += rowH
    // Row separators + column separators.
    line.push(
      `<line x1="${x0}" y1="${y}" x2="${x0 + gridW}" y2="${y}" stroke="${theme_border()}"/>`,
    )
    for (let i = 1; i < cols.length; i++)
      line.push(
        `<line x1="${x0 + i * cw}" y1="${top}" x2="${x0 + i * cw}" y2="${y}" stroke="${theme_border()}"/>`,
      )
    // Wrap the step + hazard text across up to three short lines each.
    wrap(r.step, 22).forEach((ln, k) =>
      line.push(
        `<text x="${x0 + 6}" y="${top + 16 + k * 14}" font-size="11.5" fill="${ink}">${esc(ln)}</text>`,
      ),
    )
    wrap(r.hazard, 24).forEach((ln, k) =>
      line.push(
        `<text x="${x0 + cw + 6}" y="${top + 16 + k * 14}" font-size="11" fill="${muted}">${esc(ln)}</text>`,
      ),
    )
  }
  line.push(
    `<text x="${x0}" y="${height - 22}" font-size="11.5" fill="${muted}">made with Procezio · hazard pre-filled from the map · complete the rest with the team</text>`,
  )
  line.push(`</svg>`)
  return line.join('\n')
}

const theme_border = (): string => '#D9D2C4'

/** Break text into up to 3 lines of ~max chars, for a grid cell. */
function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      lines.push(cur.trim())
      cur = w
    } else cur = (cur + ' ' + w).trim()
    if (lines.length === 2) break
  }
  if (cur && lines.length < 3) lines.push(cur.trim())
  return lines.slice(0, 3)
}
