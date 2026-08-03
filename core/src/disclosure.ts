// EU AI Act Art. 50 disclosure - the envelope, and the per-format expressions of it.
//
// Adapted from the Automatiqa Lab reference implementation (ai-act-disclosure skill,
// assets/disclosure-reference.ts). The semantics are the contract; this file is the
// Procezio-shaped copy. Pure and isomorphic like the rest of core: no node:*, no wall
// clock except an injected `now`, zero runtime dependencies.
//
// Three rules this module ENFORCES rather than documents:
//   - Conditional. Nothing drafted means no envelope at all, so the ABSENCE of marking
//     stays a truthful claim and a machine consumer can trust its presence.
//   - Idempotent. Marking twice is a no-op, keyed off the `schema` field (alreadyMarked).
//   - The model is never named in visible output. Art. 50 requires disclosing THAT
//     content is AI-generated, never WHICH system produced it - and Procezio's endpoint
//     is the user's own, so printing its model id would leak their local setup for no
//     legal benefit. `model` exists in the type for operators who chose the model
//     centrally; Procezio never sets it.
//
// The wording itself is never a literal at a call site: it comes from disclosure.yaml via
// the generated config module (ci:disclosure-drift), and is passed in.

/** The marking convention this build speaks. Consumers key idempotency off this string. */
export const DISCLOSURE_SCHEMA = 'automatiqa-disclosure/1' as const

/**
 * The product name carried in every envelope this build emits. Mirrored by `system` in
 * disclosure.yaml and pinned to it by ci:disclosure-drift, so config and code cannot drift.
 */
export const DISCLOSURE_SYSTEM = 'procezio'

/** Scope of one model response crossing the agent boundary (the LLM client's own marking). */
export const MODEL_RESPONSE_SCOPE: readonly string[] = ['model_response']

/** Whether a human accepted the generated content before it left the system. */
export type ReviewState = 'accepted' | 'unreviewed' | 'mixed' | 'none'

/** The five facts every format expresses, per assets/metadata.schema.json. */
export interface DisclosureEnvelope {
  readonly value: true
  readonly scope: readonly string[]
  readonly schema: typeof DISCLOSURE_SCHEMA
  readonly system: string
  readonly review_state: ReviewState
  readonly items_drafted: number
  readonly items_total?: number
  readonly model?: string
  readonly ts: string
}

export interface EnvelopeInput {
  system: string
  scope: readonly string[]
  drafted: number
  total?: number
  reviewState?: ReviewState
  /** Injected clock, so a caller inside a pure function can stay pure. */
  now?: () => Date
}

/** The envelope, or null when there is nothing to mark. */
export function envelope(input: EnvelopeInput): DisclosureEnvelope | null {
  if (input.drafted <= 0 || input.scope.length === 0) return null
  return {
    value: true,
    scope: [...input.scope],
    schema: DISCLOSURE_SCHEMA,
    system: input.system,
    review_state: input.reviewState ?? 'none',
    items_drafted: input.drafted,
    ...(input.total !== undefined && input.total > 0 ? { items_total: input.total } : {}),
    ts: (input.now ?? (() => new Date()))().toISOString(),
  }
}

/** Idempotency check - a payload may cross the boundary more than once. */
export function alreadyMarked(payload: Record<string, unknown>): boolean {
  const existing = payload['ai_generated'] as { schema?: string } | undefined
  return existing?.schema === DISCLOSURE_SCHEMA
}

/** The wording half of disclosure.yaml, handed to documentLine (never a literal here). */
export interface DisclosureWording {
  drafted: string
  unreviewed: string
  none: string
  session_notice: string
}

/** The identity half of disclosure.yaml: who is marking, and over what. */
export interface DisclosureIdentity {
  version: number
  schema: typeof DISCLOSURE_SCHEMA
  system: string
  scope: string[]
  contact: string
}

/**
 * The counted part of an envelope. A DisclosureEnvelope satisfies it, and so does a bare
 * count - which is what lets a PURE composer render the visible line without minting a
 * timestamp it would have no use for.
 */
export interface DisclosureCount {
  readonly items_drafted: number
  readonly items_total?: number
}

/**
 * The visible line for a generated document. Empty string when nothing was drafted: a
 * canvas nobody used the agent on exports exactly as it did before.
 */
export function documentLine(
  counts: DisclosureCount | null,
  wording: { drafted: string; unreviewed: string },
  pending = 0,
): string {
  if (counts === null || counts.items_drafted <= 0) return ''
  const fill = (t: string): string =>
    t
      .replace('{drafted}', String(counts.items_drafted))
      .replace('{total}', String(counts.items_total ?? counts.items_drafted))
      .replace('{pending}', String(pending))
  return pending > 0 ? fill(wording.unreviewed) : fill(wording.drafted)
}

/** PNG tEXt chunk pairs. Keys stay lowercase-hyphenated to match the other formats. */
export function pngTextChunks(env: DisclosureEnvelope | null): ReadonlyArray<[string, string]> {
  if (env === null) return []
  return [
    ['ai-generated', 'true'],
    ['ai-scope', env.scope.join(',')],
    ['ai-review-state', env.review_state],
    ['ai-schema', env.schema],
  ]
}

/** Entries for a PDF document information dictionary. */
export function pdfInfoEntries(env: DisclosureEnvelope | null): ReadonlyArray<[string, string]> {
  if (env === null) return []
  return [
    ['AIGenerated', 'true'],
    ['AIScope', env.scope.join(',')],
    ['AIReviewState', env.review_state],
    ['AISchemaVersion', env.schema],
  ]
}

/** The XMP packet embedded as the PDF catalog's /Metadata stream. */
export function xmp(env: DisclosureEnvelope | null): string {
  if (env === null) return ''
  return [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '  <rdf:Description rdf:about="" xmlns:aiq="https://automatiqa.io/ns/disclosure/1#">',
    '   <aiq:aiGenerated>true</aiq:aiGenerated>',
    `   <aiq:scope>${env.scope.join(',')}</aiq:scope>`,
    `   <aiq:reviewState>${env.review_state}</aiq:reviewState>`,
    `   <aiq:schemaVersion>${env.schema}</aiq:schemaVersion>`,
    '  </rdf:Description>',
    ' </rdf:RDF>',
    '</x:xmpmeta>',
  ].join('\n')
}
