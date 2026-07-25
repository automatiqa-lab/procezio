// M2-12 - the session-wide assumption ledger panel (v0.3 A2).
//
// A PURE VIEW over the M2-01 store, rendered as a persistent right-hand panel across
// every zone (the ledger spans the session, not one zone). It reads canvas.assumptions
// (a C9 projection) and writes one assumption.added event per entry.
//
//   read : store canvas -> canvas.assumptions -> view
//   write: fill the form, Flag -> buildAssumptionAddedCandidate -> store.dispatch
//
// The verification gate (v0.3 A2) is surfaced at the top: the count of low-confidence
// assumptions with no verify plan, the ones that block a business-case export until
// acknowledged. This panel does not itself block export - it makes the gate visible;
// the export path (later) reads the same unverifiedCount.
//
// Layering (constitution / AGENTS.md): flagging shapes the candidate; the precompiled
// ajv validator in the C8 store decides acceptance and C9 appends it. Never truth here.

import { useMemo, useRef, useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { Assumption } from '@procezio/schema'
import { evidenceStatus } from '@procezio/core'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import {
  CONFIDENCE_LEVELS,
  buildAssumptionAddedCandidate,
  needsVerification,
  newAssumption,
  revisedAssumption,
  unverifiedCount,
  zoneFromSource,
} from './events.js'

export interface AssumptionPanelProps {
  store: StoreApi<CanvasStoreState>
  /**
   * Navigate the canvas to a zone (App's selectZone: active frame + camera flight).
   * When an entry's source names a zone ("Zone 4", "Data & Rules"), the entry offers
   * a direct jump to the place needing clarification.
   */
  onGoToZone?: (zone: number) => void
}

const field = {
  width: '100%',
  padding: '7px 9px',
  fontSize: 13,
  color: theme.text,
  background: '#ffffff',
  border: `1px solid ${theme.border}`,
  borderRadius: 6,
  boxSizing: 'border-box' as const,
}

function confidenceColor(c: Assumption['confidence']): string {
  if (c === 'high') return theme.pass
  if (c === 'low') return theme.friction
  return theme.textMuted
}

export function AssumptionPanel({ store, onGoToZone }: AssumptionPanelProps): JSX.Element {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const dispatch = useCanvasStore(store, (s) => s.dispatch)

  const assumptions = canvas.assumptions ?? []
  const blocking = useMemo(() => unverifiedCount(assumptions), [assumptions])
  const canMutate = sessionId !== null

  const [statement, setStatement] = useState('')
  const [source, setSource] = useState('')
  const [confidence, setConfidence] = useState<Assumption['confidence']>('med')
  const [verifyBy, setVerifyBy] = useState('')
  // Optional Admiralty grade (D2): reliability A-F and corroboration 1-6, independent. '' = ungraded.
  const [reliability, setReliability] = useState('')
  const [corroboration, setCorroboration] = useState('')
  // Evidence reference (D7): a document/screenshot/ticket that backs this assumption. Local only.
  const [evidence, setEvidence] = useState('')
  const [open, setOpen] = useState(false)

  // The in-place review editor (the actionable blocker, Aleks 2026-07-24): EVERY
  // ledger entry opens on click - raise confidence once verified, set/adjust the
  // verify plan, attach evidence. Which entry is open, and its draft fields:
  const [editing, setEditing] = useState<number | null>(null)
  const [editConf, setEditConf] = useState<Assumption['confidence']>('low')
  const [plan, setPlan] = useState('')
  const [editEvidence, setEditEvidence] = useState('')
  const itemRefs = useRef<Array<HTMLLIElement | null>>([])

  const openEditor = (idx: number): void => {
    const a = assumptions[idx]
    if (a === undefined) return
    setEditing(idx)
    setEditConf(a.confidence)
    setPlan(a.verify_by ?? '')
    setEditEvidence(a.evidence ?? '')
  }

  // The blocker banner is a BUTTON: clicking it lands the user exactly where the
  // review is needed - the first offending entry scrolls into view with its
  // editor open.
  const jumpToFirstBlocked = (): void => {
    const idx = assumptions.findIndex(needsVerification)
    if (idx === -1) return
    openEditor(idx)
    itemRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const saveEdit = (a: Assumption): void => {
    if (sessionId === null) return
    // Same-id upsert (id minted here at the app edge for pre-amendment entries);
    // C9 replaces the entry in place - the ledger never duplicates on review.
    dispatch(
      buildAssumptionAddedCandidate(
        sessionId,
        revisedAssumption(
          a,
          { confidence: editConf, verifyBy: plan, evidence: editEvidence },
          crypto.randomUUID(),
        ),
      ),
    )
    setEditing(null)
  }

  const valid = statement.trim().length > 0 && source.trim().length > 0

  const flag = (): void => {
    if (sessionId === null || !valid) return
    const admiralty =
      reliability !== '' && corroboration !== ''
        ? {
            reliability: reliability as NonNullable<Assumption['admiralty']>['reliability'],
            corroboration: corroboration as NonNullable<Assumption['admiralty']>['corroboration'],
          }
        : undefined
    // Born with an id (v0.4 amendment), so the entry can be acknowledged in place later.
    dispatch(
      buildAssumptionAddedCandidate(
        sessionId,
        newAssumption(
          statement,
          source,
          confidence,
          verifyBy,
          '',
          admiralty,
          evidence,
          crypto.randomUUID(),
        ),
      ),
    )
    setStatement('')
    setSource('')
    setConfidence('med')
    setVerifyBy('')
    setReliability('')
    setCorroboration('')
    setEvidence('')
    setOpen(false)
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}
    >
      {/* Header + gate summary */}
      <div style={{ padding: '18px 16px 12px', borderBottom: `1px solid ${theme.border}` }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: theme.accent,
          }}
        >
          Assumption ledger
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, lineHeight: 1.45 }}>
          Every gut-feel number, flagged and sourced. Prints as the case annex.
        </div>
        {blocking > 0 ? (
          <button
            type="button"
            onClick={jumpToFirstBlocked}
            aria-label="Go to the first assumption that needs a verify plan"
            title="Click to jump to the entry and add its verify plan"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.4,
              color: theme.friction,
              background: 'rgba(180, 85, 45, 0.08)',
              border: `1px solid ${theme.friction}`,
            }}
          >
            {`${blocking} low-confidence assumption${blocking === 1 ? ' needs' : 's need'} a verify plan before export.`}
            <span style={{ display: 'block', fontWeight: 400, fontSize: 11, marginTop: 2 }}>
              Click to go there and fix it.
            </span>
          </button>
        ) : (
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.4,
              color: theme.pass,
              background: 'rgba(56, 133, 91, 0.08)',
              border: `1px solid ${theme.pass}`,
            }}
          >
            {assumptions.length === 0
              ? 'No assumptions flagged yet.'
              : 'All assumptions acknowledged - export is clear.'}
          </div>
        )}
        {assumptions.length > 0 &&
          (() => {
            // D7: how much of the ledger stands on concrete proof vs is asserted-only.
            const ev = evidenceStatus(canvas)
            return (
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>
                📎 {ev.backed} evidence-backed · {ev.asserted} asserted-only
              </div>
            )
          })()}
      </div>

      {/* The ledger list */}
      <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '12px 14px' }}>
        {assumptions.length === 0 ? (
          <p style={{ fontSize: 13, color: theme.textMuted, margin: 0, lineHeight: 1.5 }}>
            Flag a gut-feel number as you go - it keeps the improvement case honest.
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {assumptions.map((a, i) => {
              const flagUnverified = needsVerification(a)
              const zone = zoneFromSource(a.source)
              return (
                <li
                  key={i}
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  style={{
                    padding: '10px 11px',
                    border: `1px solid ${flagUnverified ? theme.pencil : theme.border}`,
                    borderRadius: 8,
                    background: flagUnverified ? theme.pencilSoft : theme.surface,
                  }}
                >
                  {/* The WHOLE card is the way in (Aleks 2026-07-24): clicking it opens
                      the in-place review editor - confidence, verify plan, evidence. */}
                  <button
                    type="button"
                    onClick={() => (editing === i ? setEditing(null) : openEditor(i))}
                    disabled={!canMutate}
                    aria-label={`Review assumption: ${a.statement}`}
                    aria-expanded={editing === i}
                    title={
                      editing === i
                        ? 'Close the editor'
                        : 'Click to review or update this assumption'
                    }
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      cursor: canMutate ? 'pointer' : 'default',
                      font: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          color: theme.onAccent,
                          background: confidenceColor(a.confidence),
                          borderRadius: 999,
                          padding: '1px 7px',
                        }}
                      >
                        {a.confidence}
                      </span>
                      <span style={{ fontSize: 11, color: theme.textMuted }}>{a.source}</span>
                      {a.admiralty && (
                        <span
                          title="Admiralty grade: source reliability (A-F) and corroboration (1-6)"
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            fontFamily: theme.mono,
                            color: theme.accent,
                            border: `1px solid ${theme.border}`,
                            borderRadius: 5,
                            padding: '0 5px',
                          }}
                        >
                          {a.admiralty.reliability}
                          {a.admiralty.corroboration}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.textMuted }}>
                        ✎
                      </span>
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13,
                        color: theme.text,
                        lineHeight: 1.4,
                      }}
                    >
                      {a.statement}
                    </span>
                    {a.verify_by ? (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11,
                          color: theme.textMuted,
                          marginTop: 4,
                        }}
                      >
                        Verify: {a.verify_by}
                      </span>
                    ) : flagUnverified ? (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11,
                          color: theme.pencil,
                          fontWeight: 600,
                          marginTop: 4,
                          textDecoration: 'underline',
                        }}
                      >
                        Needs a verify plan - click to add one
                      </span>
                    ) : null}
                    {a.evidence ? (
                      <span
                        style={{ display: 'block', fontSize: 11, color: theme.pass, marginTop: 3 }}
                      >
                        📎 evidence-backed: {a.evidence}
                      </span>
                    ) : null}
                  </button>

                  {/* The source names a zone -> a direct jump to the place needing
                      clarification (App's selectZone: active frame + camera flight). */}
                  {zone !== null && onGoToZone !== undefined ? (
                    <button
                      type="button"
                      onClick={() => onGoToZone(zone.id)}
                      style={{
                        marginTop: 6,
                        padding: '3px 9px',
                        border: `1px solid ${theme.border}`,
                        borderRadius: 12,
                        background: '#fff',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                        color: theme.accent,
                      }}
                    >
                      ↗ Clarify in {zone.name}
                    </button>
                  ) : null}

                  {editing === i ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select
                          aria-label="Confidence after review"
                          value={editConf}
                          onChange={(e) => setEditConf(e.target.value as Assumption['confidence'])}
                          style={{ ...field, flex: '0 0 90px', fontSize: 12 }}
                        >
                          {CONFIDENCE_LEVELS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Verify plan"
                          autoFocus
                          value={plan}
                          onChange={(e) => setPlan(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(a)
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          placeholder="how you'll verify it (who / what data)"
                          style={{ ...field, flex: '1 1 auto', fontSize: 12 }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          aria-label="Evidence reference for this assumption"
                          value={editEvidence}
                          onChange={(e) => setEditEvidence(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(a)
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          placeholder="evidence: a doc, screenshot, ticket (optional)"
                          style={{ ...field, flex: '1 1 auto', fontSize: 12 }}
                        />
                        <button
                          type="button"
                          onClick={() => saveEdit(a)}
                          style={{
                            cursor: 'pointer',
                            border: `1px solid ${theme.accent}`,
                            borderRadius: 6,
                            padding: '0 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            color: theme.onAccent,
                            background: theme.accent,
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Add form (collapsible) */}
      <div style={{ borderTop: `1px solid ${theme.border}`, padding: '12px 14px' }}>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!canMutate}
            style={{
              width: '100%',
              cursor: canMutate ? 'pointer' : 'default',
              border: `1px dashed ${theme.accent}`,
              borderRadius: 8,
              padding: '9px',
              fontSize: 13,
              fontWeight: 700,
              color: theme.accent,
              background: 'transparent',
            }}
          >
            + Flag an assumption
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              aria-label="Assumption statement"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="what you assumed"
              disabled={!canMutate}
              style={field}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                aria-label="Assumption source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="source (e.g. Zone 1)"
                disabled={!canMutate}
                style={{ ...field, flex: 2 }}
              />
              <select
                aria-label="Assumption confidence"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value as Assumption['confidence'])}
                disabled={!canMutate}
                style={{ ...field, flex: 1 }}
              >
                {CONFIDENCE_LEVELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <input
              aria-label="Assumption verify by"
              value={verifyBy}
              onChange={(e) => setVerifyBy(e.target.value)}
              placeholder="how you'll verify it (optional)"
              disabled={!canMutate}
              style={field}
            />
            {/* Admiralty grade (D2): two independent axes - source reliability, corroboration. */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: theme.textMuted, flex: '0 0 auto' }}>
                Admiralty
              </span>
              <select
                aria-label="Source reliability (A-F)"
                value={reliability}
                onChange={(e) => setReliability(e.target.value)}
                disabled={!canMutate}
                style={{ ...field, flex: 1 }}
              >
                <option value="">reliability -</option>
                {['A', 'B', 'C', 'D', 'E', 'F'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                aria-label="Corroboration (1-6)"
                value={corroboration}
                onChange={(e) => setCorroboration(e.target.value)}
                disabled={!canMutate}
                style={{ ...field, flex: 1 }}
              >
                <option value="">corrob. -</option>
                {['1', '2', '3', '4', '5', '6'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {/* Evidence reference (D7): the proof backing this - stays local, only the reference. */}
            <input
              aria-label="Evidence reference"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="evidence: a doc, screenshot, ticket (optional, local)"
              disabled={!canMutate}
              style={field}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={flag}
                disabled={!canMutate || !valid}
                style={{
                  flex: 1,
                  cursor: valid ? 'pointer' : 'default',
                  border: `1px solid ${valid ? theme.accent : theme.border}`,
                  borderRadius: 8,
                  padding: '8px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: valid ? theme.onAccent : theme.textMuted,
                  background: valid ? theme.accent : theme.surface2,
                }}
              >
                Flag it
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  cursor: 'pointer',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  color: theme.textMuted,
                  background: '#ffffff',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
