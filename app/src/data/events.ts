// M2-07 - the app-boundary event builder for the Zone 4 (Data & Rules) surface.
//
// Pure candidate builder like every zone's events.ts - see store/envelope.ts for the
// canonical purity/layering explanation. C9 project() upserts the tag BY ID into
// canvas.audit_tags; setting the same step's profile again reuses that id, so it edits
// in place rather than piling up duplicate tags.

import type { DispatchCandidate } from '../store/canvas-store.js'
import { humanInk } from '../store/envelope.js'
import type { AuditTag, DataTag, ExceptionsTag, RulesTag } from '@procezio/schema'

/**
 * The three data-shape rungs, ordered easiest-to-automate first (spec v0.2 section 7,
 * zone 4). Typed against the imported `DataTag` union via `satisfies`, so the option
 * list cannot drift from the schema's own literal values - it is never a second
 * source of truth for validity (ajv inside the C8 store still gates truth).
 */
export const DATA_TAGS = [
  'structured',
  'semi-structured',
  'unstructured',
] as const satisfies readonly DataTag[]

/** The three rules rungs, explicit-first (spec v0.2 section 7, zone 4). */
export const RULES_TAGS = ['explicit', 'mixed', 'judgment'] as const satisfies readonly RulesTag[]

/** The three exception-frequency rungs, rare-first (spec v0.2 section 7, zone 4). */
export const EXCEPTIONS_TAGS = [
  'rare',
  'occasional',
  'frequent',
] as const satisfies readonly ExceptionsTag[]

/**
 * A one-line, plain-language gloss per option, shown under each segmented control so
 * a no-code user reads meaning, not jargon. Display only - never a source of truth.
 */
export const AXIS_HELP = {
  data: {
    structured: 'clean fields, a form or table',
    'semi-structured': 'a document with a predictable shape',
    unstructured: 'free text, email, a phone call',
  },
  rules: {
    explicit: 'a written rule decides every time',
    mixed: 'rules mostly, with some judgement',
    judgment: 'a person weighs it up each time',
  },
  exceptions: {
    rare: 'almost every case is the normal path',
    occasional: 'a handful of odd cases a week',
    frequent: 'edge cases are the norm',
  },
} as const satisfies {
  data: Record<DataTag, string>
  rules: Record<RulesTag, string>
  exceptions: Record<ExceptionsTag, string>
}

/**
 * Wrap a schema AuditTag in an `audit_tag.set` DispatchCandidate. `sessionId` is the
 * open session's id (minted at the app boundary and carried by every candidate as
 * both session_id and correlation_id, exactly as friction/events.ts does). event_id
 * and ts are deliberately absent - the store resolves them from its injected
 * providers, so this stays a pure function of its inputs. The AuditTag's own id is
 * minted (or reused, when editing) by the caller at the app edge; C9's upsert-by-id
 * then places it in canvas.audit_tags.
 */
export function buildAuditTagSetCandidate(
  sessionId: string,
  auditTag: AuditTag,
): DispatchCandidate {
  return humanInk(sessionId, 'audit_tag.set', { audit_tag: auditTag })
}
