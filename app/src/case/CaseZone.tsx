// M2-11 - the Zone 8 (Improvement case) surface, the capstone.
//
// A PURE VIEW over the M2-01 store. The eligible shortlist reads canvas.opportunities
// gated by canvas.gates (only gate-cleared opportunities can hold a case - the zone-7
// gate blocks the case), and each saved draft reads canvas.cases (a C9 projection,
// M2-AMD2). Every draft leaves the UI as one case.drafted event.
//
//   read : store canvas -> cleared opportunities + canvas.cases -> view
//   write: build figures + assumptions, Save draft -> buildCaseDraftedCandidate -> dispatch
//
// Traceability (hard rule): every figure cites a canvas source_ref - no number is
// invented. v0.3 A1: benefits are classified; a capacity-release benefit is flagged
// until a redeployment owner is named, and freed hours are never summed into savings.
//
// Layering (constitution / AGENTS.md): saving shapes the candidate; the precompiled
// ajv validator in the C8 store decides acceptance and C9 upserts it by opportunity_id.
//
// The pure derivations (shortlist, gate status, draft validity/normalization, dirty
// check) live in ./model.ts so they run headless under node:test; this file stays
// presentational.

import { useEffect, useMemo, useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { LlmClient } from '@procezio/core'
import type { Assumption, CasePayload, Opportunity } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { draftCaseCandidate } from '../tasks/draft.js'
import { theme } from '../theme.js'
import { BenchmarkShelf } from '../benchmarks/BenchmarkShelf.js'
import {
  BENEFIT_CLASSES,
  BENEFIT_CLASS_INFO,
  CONFIDENCE_LEVELS,
  FIGURE_KINDS,
  type BenefitClass,
  type Figure,
  buildCaseDraftedCandidate,
  needsRedeploymentOwner,
  sourceOptions,
} from './events.js'
import { GATE_CHECKS } from '../gate/events.js'
import {
  assembleCanvasData,
  caseStatusFor,
  clearedChecks,
  committedOpportunities,
  emptyAssumption,
  emptyFigure,
  finalizeAssumption,
  finalizeFigure,
  isAssumptionDraftValid,
  isCaseDirty,
  isCaseEligible,
  isFigureDraftValid,
  savedCaseFor,
  splitFigures,
} from './model.js'

export interface CaseZoneProps {
  store: StoreApi<CanvasStoreState>
  /** The connected model (or null). When present the agent can draft the case in pencil. */
  client?: LlmClient | null
}

const inputStyle = {
  padding: '8px 10px',
  fontSize: 13,
  color: theme.text,
  background: '#ffffff',
  border: `1px solid ${theme.border}`,
  borderRadius: 6,
  boxSizing: 'border-box' as const,
}

export function CaseZone({ store, client }: CaseZoneProps): JSX.Element {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const dispatch = useCanvasStore(store, (s) => s.dispatch)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)

  const committed = committedOpportunities(canvas)
  const sources = useMemo(() => sourceOptions(canvas), [canvas])
  const canMutate = sessionId !== null

  const selected = selectedId === null ? null : (committed.find((o) => o.id === selectedId) ?? null)
  const eligible = selected !== null && isCaseEligible(canvas, selected.id)
  const savedCase = selectedId === null ? null : savedCaseFor(canvas, selectedId)

  // The agent drafts the case in pencil from canvas data; the human then edits and Saves
  // (which re-dispatches as ink). The draft never invents a figure - the task validator
  // requires a source_ref on each.
  const runDraft = async (): Promise<void> => {
    if (client === null || client === undefined || sessionId === null || selected === null) return
    setDrafting(true)
    const cand = await draftCaseCandidate(client, sessionId, {
      opportunityId: selected.id,
      title: selected.title,
      canvas: assembleCanvasData(canvas),
    })
    setDrafting(false)
    if (cand !== null) dispatch(cand)
  }
  const canDraft = client !== null && client !== undefined

  // --- Empty state: nothing committed to case yet. ------------------------------
  if (committed.length === 0) {
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
        <div style={{ maxWidth: 700 }}>
          <ZoneHeader />
          <div
            style={{
              marginTop: 24,
              padding: '22px 24px',
              border: `1px dashed ${theme.border}`,
              borderRadius: 10,
              background: theme.surface,
              fontSize: 15,
              lineHeight: 1.55,
              color: theme.textMuted,
            }}
          >
            No case to draft yet. Commit an opportunity in <strong>Prioritize</strong> (Zone 6) -
            its case can be drafted right away (watermarked provisional until the{' '}
            <strong>Risk gate</strong> clears; the gate still blocks the export).
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ padding: '28px 32px 12px', borderBottom: `1px solid ${theme.border}` }}>
        <ZoneHeader />
      </div>
      <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0 }}>
        {/* Left: the committed shortlist, with gate state. */}
        <div
          style={{
            flex: '0 0 260px',
            width: 260,
            height: '100%',
            boxSizing: 'border-box',
            overflowY: 'auto',
            borderRight: `1px solid ${theme.border}`,
            background: theme.surface,
            padding: '16px 12px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: theme.textMuted,
              padding: '0 6px 8px',
            }}
          >
            Committed
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {committed.map((o) => {
              const isActive = o.id === selectedId
              const status = caseStatusFor(canvas, o.id)
              const ok = status !== 'blocked'
              const drafted = status === 'drafted'
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(o.id)}
                    aria-current={isActive ? 'true' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: 'none',
                      borderRadius: 6,
                      padding: '9px 10px',
                      marginBottom: 2,
                      fontSize: 13,
                      color: isActive ? theme.accent : theme.text,
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? theme.accentSoft : 'transparent',
                    }}
                  >
                    <span
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {o.title}
                    </span>
                    <span
                      aria-label={ok ? 'gate cleared' : 'gate blocked'}
                      title={ok ? 'gate cleared' : 'gate not cleared'}
                      style={{
                        flex: '0 0 auto',
                        fontSize: 11,
                        fontWeight: 700,
                        color: theme.onAccent,
                        background: ok ? (drafted ? theme.pass : theme.accent) : theme.friction,
                        borderRadius: 999,
                        padding: '1px 7px',
                      }}
                    >
                      {ok ? (drafted ? '✓' : '○') : '✕'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <BenchmarkShelf store={store} />
        </div>

        {/* Right: the case builder / preview for the selected opportunity. */}
        <div
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            height: '100%',
            overflowY: 'auto',
            boxSizing: 'border-box',
            padding: '22px 28px',
          }}
        >
          {selected === null ? (
            <p style={{ fontSize: 15, color: theme.textMuted, margin: 0 }}>
              Pick a committed opportunity on the left to draft its improvement case.
            </p>
          ) : (
            <>
              {/* 2026-07-24b amendment: the risk gate no longer HIDES the case - it
                  watermarks it. The full builder renders so inputs can be re-validated
                  early; export stays hard-blocked by the unchanged gates. */}
              {!eligible ? (
                <div
                  role="note"
                  style={{
                    maxWidth: 720,
                    marginBottom: 16,
                    padding: '12px 16px',
                    border: `1px solid ${theme.friction}`,
                    borderRadius: 8,
                    background: 'rgba(180, 85, 45, 0.06)',
                    fontSize: 13,
                    color: theme.text,
                    lineHeight: 1.5,
                  }}
                >
                  <strong>PROVISIONAL</strong> - the <strong>Risk gate</strong> (Zone 7) has{' '}
                  {GATE_CHECKS.length - clearedChecks(canvas, selected.id)} of {GATE_CHECKS.length}{' '}
                  checks still open for this opportunity. Draft and refine the case now; it stays a
                  draft for verification, and export is blocked until the gate clears.
                </div>
              ) : null}
              <CaseBuilder
                key={selected.id}
                opportunity={selected}
                savedCase={savedCase}
                sources={sources}
                disabled={!canMutate}
                onDraft={canDraft ? runDraft : undefined}
                drafting={drafting}
                onSave={(payload) => {
                  if (sessionId !== null) dispatch(buildCaseDraftedCandidate(sessionId, payload))
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// --- The builder for one eligible opportunity. --------------------------------
interface CaseBuilderProps {
  opportunity: Opportunity
  savedCase: CasePayload | null
  sources: { id: string; label: string }[]
  disabled: boolean
  onSave: (payload: CasePayload) => void
  /** Ask the agent to draft the case (undefined when no model is connected). */
  onDraft: (() => Promise<void>) | undefined
  drafting: boolean
}

function CaseBuilder({
  opportunity,
  savedCase,
  sources,
  disabled,
  onSave,
  onDraft,
  drafting,
}: CaseBuilderProps): JSX.Element {
  const [figures, setFigures] = useState<Figure[]>(savedCase?.figures ?? [])
  const [assumptions, setAssumptions] = useState<Assumption[]>(savedCase?.assumptions ?? [])
  const [fig, setFig] = useState<Figure>(emptyFigure())
  const [asm, setAsm] = useState<Assumption>(emptyAssumption())

  // Re-seed if the saved draft changes (e.g. selecting a different opportunity is
  // handled by the key remount; this covers a redraft landing from elsewhere).
  useEffect(() => {
    setFigures(savedCase?.figures ?? [])
    setAssumptions(savedCase?.assumptions ?? [])
  }, [savedCase])

  const figValid = isFigureDraftValid(fig)
  const asmValid = isAssumptionDraftValid(asm)

  const addFigure = (): void => {
    if (!figValid) return
    // finalizeFigure (model.ts) normalizes the draft: trims, and a cost figure carries
    // no benefit classification while a capacity-release benefit carries its owner
    // only when one is named (v0.3 A1).
    setFigures((f) => [...f, finalizeFigure(fig)])
    setFig(emptyFigure())
  }

  const addAssumption = (): void => {
    if (!asmValid) return
    setAssumptions((a) => [...a, finalizeAssumption(asm)])
    setAsm(emptyAssumption())
  }

  const save = (): void => {
    onSave({ opportunity_id: opportunity.id, figures, assumptions })
  }

  const { costs, benefits } = splitFigures(figures)
  const dirty = isCaseDirty(figures, assumptions, savedCase)

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: theme.text }}>
        {opportunity.title}
      </h2>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 16px' }}>
        Every figure cites where it came from. Benefits are classified - freed hours are not savings
        until someone owns redeploying them.
      </p>

      {/* Agent draft - fills the figures/assumptions in pencil from canvas data, which
          you then edit and Save. Offered only when a model is connected. */}
      {onDraft !== undefined ? (
        <button
          type="button"
          onClick={() => void onDraft()}
          disabled={disabled || drafting}
          style={{
            marginBottom: 20,
            cursor: drafting ? 'default' : 'pointer',
            border: `1px dashed ${theme.accent}`,
            borderRadius: 8,
            padding: '9px 16px',
            fontSize: 13,
            fontWeight: 700,
            color: theme.accent,
            background: 'transparent',
          }}
        >
          {drafting ? 'Drafting…' : '◆ Draft this case with the agent'}
        </button>
      ) : null}

      {/* Add a figure */}
      <SectionLabel title="Figures" />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'flex-end',
          marginBottom: 12,
        }}
      >
        <Field label="Label" width={180}>
          <input
            aria-label="Figure label"
            value={fig.label}
            disabled={disabled}
            onChange={(e) => setFig({ ...fig, label: e.target.value })}
            placeholder="e.g. match rework"
            style={{ ...inputStyle, width: '100%' }}
          />
        </Field>
        <Field label="Value" width={130}>
          <input
            aria-label="Figure value"
            value={fig.value}
            disabled={disabled}
            onChange={(e) => setFig({ ...fig, value: e.target.value })}
            placeholder="~40 h/month"
            style={{ ...inputStyle, width: '100%' }}
          />
        </Field>
        <Field label="Kind" width={130}>
          <select
            aria-label="Figure kind"
            value={fig.kind}
            disabled={disabled}
            onChange={(e) => setFig({ ...fig, kind: e.target.value as 'cost' | 'benefit' })}
            style={{ ...inputStyle, width: '100%' }}
          >
            {FIGURE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source" width={210}>
          <select
            aria-label="Figure source"
            value={fig.source_ref}
            disabled={disabled}
            onChange={(e) => setFig({ ...fig, source_ref: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">- cite a source -</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        {fig.kind === 'benefit' ? (
          <Field label="Benefit class" width={200}>
            <select
              aria-label="Benefit class"
              value={fig.benefit_class ?? 'hard-savings'}
              disabled={disabled}
              onChange={(e) => setFig({ ...fig, benefit_class: e.target.value as BenefitClass })}
              style={{ ...inputStyle, width: '100%' }}
            >
              {BENEFIT_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {fig.kind === 'benefit' && fig.benefit_class === 'capacity-release' ? (
          <Field label="Redeployment owner" width={200}>
            <input
              aria-label="Redeployment owner"
              value={fig.redeployment_owner ?? ''}
              disabled={disabled}
              onChange={(e) => setFig({ ...fig, redeployment_owner: e.target.value })}
              placeholder="who redeploys the hours"
              style={{ ...inputStyle, width: '100%' }}
            />
          </Field>
        ) : null}
        <button
          type="button"
          onClick={addFigure}
          disabled={disabled || !figValid}
          style={addBtnStyle(!figValid)}
        >
          Add figure
        </button>
      </div>
      {fig.kind === 'benefit' ? (
        <p
          style={{ fontSize: 12, color: theme.textMuted, margin: '0 0 16px', fontStyle: 'italic' }}
        >
          {BENEFIT_CLASS_INFO[fig.benefit_class ?? 'hard-savings']}
        </p>
      ) : null}

      {/* The two figure columns */}
      <div style={{ display: 'flex', gap: 18, marginBottom: 26, flexWrap: 'wrap' }}>
        <FigureColumn title="Cost" figures={costs} accent={theme.friction} />
        <FigureColumn title="Benefit" figures={benefits} accent={theme.pass} />
      </div>

      {/* Add an assumption */}
      <SectionLabel title="Assumptions (annex)" />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'flex-end',
          marginBottom: 12,
        }}
      >
        <Field label="Statement" width={230}>
          <input
            aria-label="Assumption statement"
            value={asm.statement}
            disabled={disabled}
            onChange={(e) => setAsm({ ...asm, statement: e.target.value })}
            placeholder="e.g. 30% mismatch rate"
            style={{ ...inputStyle, width: '100%' }}
          />
        </Field>
        <Field label="Source" width={150}>
          <input
            aria-label="Assumption source"
            value={asm.source}
            disabled={disabled}
            onChange={(e) => setAsm({ ...asm, source: e.target.value })}
            placeholder="Zone 4"
            style={{ ...inputStyle, width: '100%' }}
          />
        </Field>
        <Field label="Confidence" width={120}>
          <select
            aria-label="Assumption confidence"
            value={asm.confidence}
            disabled={disabled}
            onChange={(e) =>
              setAsm({ ...asm, confidence: e.target.value as Assumption['confidence'] })
            }
            style={{ ...inputStyle, width: '100%' }}
          >
            {CONFIDENCE_LEVELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Verify by" width={190}>
          <input
            aria-label="Assumption verify by"
            value={asm.verify_by ?? ''}
            disabled={disabled}
            onChange={(e) => setAsm({ ...asm, verify_by: e.target.value })}
            placeholder="pull the report"
            style={{ ...inputStyle, width: '100%' }}
          />
        </Field>
        <button
          type="button"
          onClick={addAssumption}
          disabled={disabled || !asmValid}
          style={addBtnStyle(!asmValid)}
        >
          Add assumption
        </button>
      </div>
      {assumptions.length > 0 ? (
        <ul
          style={{
            listStyle: 'none',
            margin: '0 0 26px',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {assumptions.map((a, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
                padding: '9px 12px',
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                background: theme.surface,
              }}
            >
              <span
                style={{
                  flex: '0 0 auto',
                  fontSize: 11,
                  fontWeight: 700,
                  color: theme.onAccent,
                  background: confidenceColor(a.confidence),
                  borderRadius: 999,
                  padding: '1px 8px',
                  textTransform: 'uppercase',
                }}
              >
                {a.confidence}
              </span>
              <span style={{ fontSize: 14, color: theme.text }}>{a.statement}</span>
              <span style={{ fontSize: 12, color: theme.textMuted }}>
                ({a.source}
                {a.verify_by ? ` · verify: ${a.verify_by}` : ''})
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 26px' }}>
          No assumptions flagged yet.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          onClick={save}
          disabled={disabled || !dirty}
          style={{
            cursor: !dirty ? 'default' : 'pointer',
            border: `1px solid ${!dirty ? theme.border : theme.accent}`,
            borderRadius: 8,
            padding: '10px 22px',
            fontSize: 14,
            fontWeight: 700,
            color: !dirty ? theme.textMuted : theme.onAccent,
            background: !dirty ? theme.surface2 : theme.accent,
          }}
        >
          {savedCase === null ? 'Save draft' : 'Update draft'}
        </button>
        {savedCase !== null && !dirty ? (
          <span style={{ fontSize: 13, color: theme.pass, fontWeight: 600 }}>
            Draft saved · {savedCase.figures.length} figures · {savedCase.assumptions.length}{' '}
            assumptions
          </span>
        ) : null}
      </div>
    </div>
  )
}

// --- A single figure column (Cost or Benefit). --------------------------------
function FigureColumn({
  title,
  figures,
  accent,
}: {
  title: string
  figures: Figure[]
  accent: string
}): JSX.Element {
  return (
    <div style={{ flex: '1 1 300px', minWidth: 280 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: accent,
          marginBottom: 8,
        }}
      >
        {title} ({figures.length})
      </div>
      {figures.length === 0 ? (
        <p style={{ fontSize: 13, color: theme.textMuted, margin: 0 }}>None yet.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {figures.map((f, i) => {
            const flag = needsRedeploymentOwner(f)
            return (
              <li
                key={i}
                style={{
                  padding: '9px 12px',
                  border: `1px solid ${flag ? theme.pencil : theme.border}`,
                  borderRadius: 8,
                  background: flag ? theme.pencilSoft : theme.surface,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 14, color: theme.text, fontWeight: 600 }}>
                    {f.label}
                  </span>
                  <span style={{ fontSize: 14, color: theme.text, fontFamily: theme.mono }}>
                    {f.value}
                  </span>
                </div>
                {f.kind === 'benefit' && f.benefit_class ? (
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
                    {f.benefit_class}
                    {f.benefit_class === 'capacity-release'
                      ? f.redeployment_owner
                        ? ` · redeployed by ${f.redeployment_owner}`
                        : ' · NOT savings until an owner is named'
                      : ''}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function confidenceColor(c: Assumption['confidence']): string {
  if (c === 'high') return theme.pass
  if (c === 'low') return theme.friction
  return theme.textMuted
}

function addBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${disabled ? theme.border : theme.accent}`,
    borderRadius: 8,
    padding: '8px 15px',
    fontSize: 13,
    fontWeight: 700,
    height: 36,
    color: disabled ? theme.textMuted : theme.onAccent,
    background: disabled ? theme.surface2 : theme.accent,
  }
}

function Field({
  label,
  width,
  children,
}: {
  label: string
  width: number
  children: React.ReactNode
}): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>{label}</span>
      {children}
    </label>
  )
}

function SectionLabel({ title }: { title: string }): JSX.Element {
  return (
    <h3
      style={{
        fontSize: 15,
        fontWeight: 700,
        margin: '0 0 10px',
        color: theme.text,
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: 6,
      }}
    >
      {title}
    </h3>
  )
}

/** The zone's title block. */
// Compact intro for the frame body (the frame header names the zone).
function ZoneHeader(): JSX.Element {
  return (
    <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 14px', color: theme.textMuted }}>
      Draft the decision-ready case for each cleared opportunity: cost and benefit, every figure
      traced to its source, every assumption flagged for verification.
    </p>
  )
}
