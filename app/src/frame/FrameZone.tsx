// M2-05 - the Zone 1 (Frame) identity + north-star form.
//
// This is a PURE VIEW over the M2-01 store, exactly like MapZone is for Zone 2.
// The store is never the source of truth in the component: every field reads from
// the projected `canvas.process` (C9's fold of the event log) and every commit
// leaves the UI as a `frame.set` event.
//
//   read : store canvas (C9 projection) -> canvas.process -> the eight inputs
//   write: field blur -> buildFrameSetCandidate (ONLY the changed field) -> dispatch
//
// Layering (constitution / AGENTS.md): the form makes no judgement about whether a
// Frame value is "good". It only shapes the partial patch; the precompiled ajv
// validator inside the C8 event store decides acceptance and C9 merges the patch
// onto canvas.process. No direct mutation of canvas.process ever happens here.
//
// Commit discipline (CardContract): editing a field updates ONLY local state -
// there is NO dispatch on keystroke. The event is emitted on blur, and only when
// the trimmed value actually changed from the last-committed value, so the event
// log is never one event per character and never a no-op frame.set. Ids/timestamps
// are minted at the store edge (App.tsx providers); this view mints nothing.

import { useEffect, useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { LlmClient } from '@procezio/core'
import { PersonasPanel } from '../personas/PersonasPanel.js'
import { plainLanguage } from '../lint/plainLanguage.js'
// Process/FramePayload are imported from the ratified schema, never redefined here
// (CardContract). FramePayload mirrors Process with every field optional, so a
// single-field patch is a valid FramePayload (schema minProperties 1).
import type { FramePayload, Process } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { buildFrameSetCandidate } from './frame.js'
import { theme } from '../theme.js'

// The eight Frame fields are exactly the keys of Process (the ontology), so the
// field union cannot drift from the schema. north_star is rendered separately as
// the emphasised anchor; the rest are the identity block below it.
type FrameField = keyof Process

/** Plain, non-coder language for each Frame field (spec v0.2 section 6, zone 1). */
const FIELD_LABELS: Readonly<Record<FrameField, string>> = {
  pain: "What's hurting?",
  name: 'What do you call this process?',
  trigger: 'What triggers this process?',
  end_state: 'What does done look like?',
  owner: 'Who owns this process?',
  frequency: 'How often does it run?',
  volume: 'How many go through in a typical period?',
  touch_time: 'How much hands-on time does one take?',
  north_star: 'North-star metric - what does better look like?',
}

/** A one-line hint under each field, in the same plain register. */
const FIELD_HINTS: Readonly<Record<FrameField, string>> = {
  pain: 'In your own words - the frustration that brought you here. The rest of the frame follows from it.',
  name: 'A short, recognisable name a colleague would understand.',
  trigger: 'The event that kicks it off - an email, an order, a date.',
  end_state: 'The concrete outcome that means this process is finished.',
  owner: 'The person or team accountable for it running.',
  frequency: 'Daily, weekly, per order - however you count it.',
  volume: 'A rough count is fine - it does not need to be exact.',
  touch_time: 'The active minutes a person spends on one run.',
  north_star: 'The single measure that tells you it got better.',
}

// The seven identity fields, in the order the form presents them below the anchor.
// north_star is deliberately absent here - it owns the emphasised anchor block.
const IDENTITY_FIELDS: readonly FrameField[] = [
  'name',
  'trigger',
  'end_state',
  'owner',
  'frequency',
  'volume',
  'touch_time',
]

/** Seed the whole-form local state from the projected process (never local truth). */
function formFrom(process: Process): Record<FrameField, string> {
  return {
    pain: process.pain ?? '',
    name: process.name ?? '',
    trigger: process.trigger ?? '',
    end_state: process.end_state ?? '',
    owner: process.owner ?? '',
    frequency: process.frequency ?? '',
    volume: process.volume ?? '',
    touch_time: process.touch_time ?? '',
    north_star: process.north_star ?? '',
  }
}

/**
 * Build the single-field partial patch for a frame.set. Assigning through a
 * FramePayload local (rather than a computed-key literal) keeps this fully typed
 * without a cast: every FramePayload value is `string | undefined`, so a string is
 * always assignable, and the patch carries exactly the one committed field.
 */
function patchFor(field: FrameField, value: string): FramePayload {
  const patch: FramePayload = {}
  patch[field] = value
  return patch
}

export interface FrameZoneProps {
  store: StoreApi<CanvasStoreState>
  /** The connected model (or null). At T1+ it can voice a summoned persona's simulated view. */
  client?: LlmClient | null
}

export function FrameZone({ store, client }: FrameZoneProps): JSX.Element {
  // Read the projected Frame from the store - the component's single source of
  // truth. canvas.process is C9's merge of session.started + every frame.set.
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const dispatch = useCanvasStore(store, (s) => s.dispatch)
  const process = canvas.process

  // Local input state, seeded from the projection. Typing updates ONLY this - no
  // event fires on keystroke. Re-seeded whenever the projected process changes
  // (same discipline Inspector uses when the selected node changes), so a committed
  // value renders back trimmed and canvas.process stays the source of truth.
  const [form, setForm] = useState<Record<FrameField, string>>(() => formFrom(process))
  useEffect(() => {
    setForm(formFrom(process))
  }, [process])

  const onType =
    (field: FrameField) =>
    (value: string): void =>
      setForm((prev) => ({ ...prev, [field]: value }))

  // Commit on blur: dispatch a frame.set carrying ONLY this field, and only when
  // the trimmed value differs from what is already committed in canvas.process.
  // That guard is what prevents both keystroke spam and no-op frame.set events.
  const onCommit = (field: FrameField) => (): void => {
    if (sessionId === null) return
    const trimmed = form[field].trim()
    const committed = process[field] ?? ''
    if (trimmed === committed) return
    dispatch(buildFrameSetCandidate(sessionId, patchFor(field, trimmed)))
  }

  const inputStyle = {
    padding: '9px 11px',
    fontSize: 14,
    color: theme.text,
    background: '#ffffff',
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    width: '100%',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 700,
    color: theme.text,
    marginBottom: 4,
  }
  const hintStyle = { fontSize: 12, color: theme.textMuted, margin: '4px 0 0' }

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '16px 18px',
      }}
    >
      <div style={{ maxWidth: 680 }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 16px', color: theme.textMuted }}>
          Start from the pain, in your own words. The name, the north-star and the rest of the frame
          follow from it. Changes save as you leave each field.
        </p>

        {/* Pain-first entry (C3): the session starts from what hurts, not a blank form. */}
        <div style={{ marginBottom: 22 }}>
          <label htmlFor="frame-pain" style={{ ...labelStyle, fontSize: 16 }}>
            {FIELD_LABELS.pain}
          </label>
          <textarea
            id="frame-pain"
            value={form.pain}
            onChange={(e) => onType('pain')(e.target.value)}
            onBlur={onCommit('pain')}
            aria-label={FIELD_LABELS.pain}
            placeholder="e.g. invoices sit for days waiting on a manual match, and month-end is chaos"
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: theme.sans }}
          />
          <p style={hintStyle}>{FIELD_HINTS.pain}</p>
        </div>

        {/* The north-star anchor: emphasised as the measure every later zone scores
            against (spec v0.2 sections 6 & 9). Given its own accented block, above
            the identity fields, so it reads as the frame's fixed point. */}
        <div
          style={{
            marginBottom: 30,
            padding: '18px 20px',
            border: `2px solid ${theme.accent}`,
            borderRadius: 10,
            background: theme.accentSoft,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: 8,
            }}
          >
            The anchor
          </div>
          <label htmlFor="frame-north_star" style={{ ...labelStyle, fontSize: 16 }}>
            {FIELD_LABELS.north_star}
          </label>
          <input
            id="frame-north_star"
            type="text"
            value={form.north_star}
            onChange={(e) => onType('north_star')(e.target.value)}
            onBlur={onCommit('north_star')}
            aria-label={FIELD_LABELS.north_star}
            placeholder="e.g. cut the average cycle time from 3 days to 1"
            style={inputStyle}
          />
          <p style={hintStyle}>{FIELD_HINTS.north_star}</p>
          {(() => {
            // Plain-language advisory (C5): never a gate, just a nudge toward plainer wording.
            const lint = plainLanguage(form.north_star)
            return lint.issues.length > 0 ? (
              <p style={{ ...hintStyle, color: theme.pencil }}>Plainer? {lint.issues[0]}</p>
            ) : null
          })()}
        </div>

        {/* Identity fields - the plain description of the process itself. */}
        {IDENTITY_FIELDS.map((field) => (
          <div key={field} style={{ marginBottom: 20 }}>
            <label htmlFor={`frame-${field}`} style={labelStyle}>
              {FIELD_LABELS[field]}
            </label>
            <input
              id={`frame-${field}`}
              type="text"
              value={form[field]}
              onChange={(e) => onType(field)(e.target.value)}
              onBlur={onCommit(field)}
              aria-label={FIELD_LABELS[field]}
              style={inputStyle}
            />
            <p style={hintStyle}>{FIELD_HINTS[field]}</p>
          </div>
        ))}

        <PersonasPanel store={store} client={client ?? null} />
      </div>
    </div>
  )
}
