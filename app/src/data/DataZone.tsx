// M2-07 - the Zone 4 (Data & Rules) tagging surface.
//
// A PURE VIEW over the M2-01 store, exactly like FrictionZone is for Zone 3. The
// store is never the source of truth in the component: the step list reads
// canvas.nodes and the saved profiles read canvas.audit_tags (both C9 projections of
// the event log), and every profile leaves the UI as one `audit_tag.set` event.
//
//   read : store canvas (C9 projection) -> canvas.nodes / canvas.audit_tags -> view
//   write: pick chips -> per-step DRAFT -> autosave dispatches buildAuditTagSetCandidate
//
// AUTOSAVE (Aleks's 2026-07-24 request): there is no Save button. Every step keeps its
// own draft, so switching steps (and coming back to change your mind) never loses a
// pick; the moment a profile is complete AND the human has touched it, it saves itself
// - and every later chip change updates it in place. Steps with map signals arrive
// PRE-FILLED from the node's own detail panel (derive.ts) - marked as suggestions, and
// saved only once the human confirms by tapping any chip (never behind their back).
//
// This is the evidence layer the zone-6 challenge later cites: for each step, how
// shaped is its DATA, how explicit are its RULES, how often do EXCEPTIONS bite. A
// step that is structured + explicit + rare is a clean automation candidate; free
// text + judgement + frequent is not, however painful its friction.
//
// One profile per step: the AuditTag is upserted BY ID (C9), so re-saving a step's
// profile REUSES the existing tag's id and edits in place - it never stacks two tags
// on one node. Ids are minted (or reused) HERE, at the app edge, the store staying
// pure.
//
// Layering (constitution / AGENTS.md): saving makes no judgement about whether the
// profile is "right". It only shapes the candidate; the precompiled ajv validator in
// the C8 event store decides acceptance and C9 upserts it into canvas.audit_tags.

import { useEffect, useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { AuditTag, DataTag, ExceptionsTag, Node, RulesTag } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import {
  AXIS_HELP,
  DATA_TAGS,
  EXCEPTIONS_TAGS,
  RULES_TAGS,
  buildAuditTagSetCandidate,
} from './events.js'
import { deriveAuditDraft } from '../derive/derive.js'
import { nodeLabel } from '../nodeLabel.js'

/** One step's in-progress profile. `touched` = the human picked a chip here, which is
 * what arms the autosave - a pure map suggestion never saves itself. */
interface Draft {
  data: DataTag | null
  rules: RulesTag | null
  exceptions: ExceptionsTag | null
  touched: boolean
}

/** Seed a step's draft: the saved profile if one exists, else the map-derived
 * suggestion (partial - unsignalled axes stay open questions). */
function seededDraft(node: Node, saved: AuditTag | null): Draft {
  if (saved !== null) {
    return { data: saved.data, rules: saved.rules, exceptions: saved.exceptions, touched: false }
  }
  const s = deriveAuditDraft(node)
  return {
    data: s.data ?? null,
    rules: s.rules ?? null,
    exceptions: s.exceptions ?? null,
    touched: false,
  }
}

export interface DataZoneProps {
  store: StoreApi<CanvasStoreState>
}

// The step's display label comes from the ONE shared rule (nodeLabel.ts).

/** A one-line summary of a saved profile, e.g. "structured · explicit · rare". */
function profileSummary(tag: AuditTag): string {
  return `${tag.data} · ${tag.rules} · ${tag.exceptions}`
}

export function DataZone({ store }: DataZoneProps): JSX.Element {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const dispatch = useCanvasStore(store, (s) => s.dispatch)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const nodes = canvas.nodes
  // canvas.audit_tags is optional in the schema but always [] in the empty
  // projection; ?? [] keeps this total without assuming the key is present.
  const auditTags = canvas.audit_tags ?? []

  const selectedNode = selectedId === null ? null : (nodes.find((n) => n.id === selectedId) ?? null)
  // A plain linear find - at most a few dozen tags; memoizing it bought nothing.
  const existingTag =
    selectedId === null ? null : (auditTags.find((t) => t.node_id === selectedId) ?? null)
  const canMutate = sessionId !== null

  // Per-step drafts: a pick on one step survives switching to another and back.
  // Keyed by node id; a step without an entry renders its seeded draft (saved
  // profile, else map suggestion) without writing state.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  // A swapped-in session (load, demo, new) must not inherit another session's drafts.
  useEffect(() => setDrafts({}), [store])

  const draft: Draft | null =
    selectedNode === null
      ? null
      : (drafts[selectedNode.id] ?? seededDraft(selectedNode, existingTag))

  // A chip pick lands in the step's draft and marks it human-touched (arms autosave).
  const pick = (axis: 'data' | 'rules' | 'exceptions', value: string): void => {
    if (selectedNode === null) return
    const node = selectedNode
    setDrafts((prev) => {
      const base = prev[node.id] ?? seededDraft(node, existingTag)
      return { ...prev, [node.id]: { ...base, [axis]: value, touched: true } }
    })
  }

  const complete =
    draft !== null && draft.data !== null && draft.rules !== null && draft.exceptions !== null
  const answered =
    draft === null
      ? 0
      : [draft.data, draft.rules, draft.exceptions].filter((v) => v !== null).length
  const dirty =
    draft !== null &&
    (existingTag === null ||
      draft.data !== existingTag.data ||
      draft.rules !== existingTag.rules ||
      draft.exceptions !== existingTag.exceptions)
  // The draft came from the map deriver and the human has not confirmed it yet.
  const suggested = draft !== null && !draft.touched && existingTag === null && answered > 0

  // --- Write: AUTOSAVE. Any touched, complete draft that differs from its saved
  // profile dispatches one audit_tag.set (upsert by id) - covering the selected step
  // and any step the user switched away from mid-thought. A FLUSHED draft is then
  // DROPPED from state: the saved tag is now the truth it reseeds from. Keeping it
  // would make the effect re-assert the profile whenever the projection disagreed -
  // i.e. pressing Undo on a profile would be silently re-applied. Dropping it lets
  // undo stick and still leaves the chips showing the (re-seeded) saved values.
  useEffect(() => {
    if (sessionId === null) return
    const flushed: string[] = []
    for (const [nodeId, d] of Object.entries(drafts)) {
      if (!d.touched || d.data === null || d.rules === null || d.exceptions === null) continue
      if (!nodes.some((n) => n.id === nodeId)) continue // step deleted meanwhile
      const saved = auditTags.find((t) => t.node_id === nodeId) ?? null
      if (
        saved !== null &&
        saved.data === d.data &&
        saved.rules === d.rules &&
        saved.exceptions === d.exceptions
      ) {
        flushed.push(nodeId) // already on file - the draft has served its purpose
        continue
      }
      const tag: AuditTag = {
        id: saved?.id ?? crypto.randomUUID(),
        node_id: nodeId,
        data: d.data,
        rules: d.rules,
        exceptions: d.exceptions,
      }
      dispatch(buildAuditTagSetCandidate(sessionId, tag))
      flushed.push(nodeId)
    }
    if (flushed.length > 0) {
      setDrafts((prev) => {
        const next = { ...prev }
        for (const id of flushed) delete next[id]
        return next
      })
    }
  }, [drafts, auditTags, nodes, sessionId, dispatch])

  // --- Empty state: no steps drawn yet - point the user back to the Map. --------
  if (nodes.length === 0) {
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
            No steps to profile yet. Draw the process in the <strong>Map</strong> (Zone 2) first -
            every data-and-rules profile attaches to a step, so the steps have to exist before you
            can profile them.
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
        {/* Left: the step list, drawn from canvas.nodes (the Map's steps). */}
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
            Steps
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {nodes.map((node) => {
              const isActive = node.id === selectedId
              const tag = auditTags.find((t) => t.node_id === node.id) ?? null
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(node.id)}
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
                      {nodeLabel(node)}
                    </span>
                    {tag !== null ? (
                      <span
                        aria-label="profiled"
                        title={profileSummary(tag)}
                        style={{
                          flex: '0 0 auto',
                          fontSize: 11,
                          fontWeight: 700,
                          color: theme.onAccent,
                          background: theme.accent,
                          borderRadius: 999,
                          padding: '1px 7px',
                        }}
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Right: the selected step's three-axis profile. */}
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
          {selectedNode === null ? (
            <p style={{ fontSize: 15, color: theme.textMuted, margin: 0 }}>
              Pick a step on the left to profile its data, rules, and exceptions.
            </p>
          ) : (
            <div style={{ maxWidth: 640 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: theme.text }}>
                {nodeLabel(selectedNode)}
              </h2>
              <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 22px' }}>
                How shaped is the work at this step? This is the evidence a later challenge will
                cite - answer honestly, not hopefully.
              </p>

              {suggested ? (
                <div
                  role="note"
                  style={{
                    fontSize: 12,
                    color: theme.pencil,
                    border: `1px dashed ${theme.pencil}`,
                    borderRadius: 8,
                    padding: '7px 10px',
                    marginBottom: 16,
                  }}
                >
                  ✎ Pre-filled from the map ({answered} of 3). Tapping any chip confirms ALL
                  pre-filled answers and saves - adjust first if one looks wrong.
                </div>
              ) : null}

              <AxisPicker<DataTag>
                label="Data"
                question="What shape is the information it works on?"
                options={DATA_TAGS}
                help={AXIS_HELP.data}
                value={draft?.data ?? null}
                onPick={(v) => pick('data', v)}
                disabled={!canMutate}
              />
              <AxisPicker<RulesTag>
                label="Rules"
                question="How is the decision made?"
                options={RULES_TAGS}
                help={AXIS_HELP.rules}
                value={draft?.rules ?? null}
                onPick={(v) => pick('rules', v)}
                disabled={!canMutate}
              />
              <AxisPicker<ExceptionsTag>
                label="Exceptions"
                question="How often does a case fall off the normal path?"
                options={EXCEPTIONS_TAGS}
                help={AXIS_HELP.exceptions}
                value={draft?.exceptions ?? null}
                onPick={(v) => pick('exceptions', v)}
                disabled={!canMutate}
              />

              {/* No Save button: the profile saves itself (see the autosave effect). This
                  line just tells the truth about where things stand. */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}
                aria-live="polite"
              >
                {existingTag !== null && !dirty ? (
                  <span style={{ fontSize: 13, color: theme.pass, fontWeight: 600 }}>
                    ✓ Saved automatically · {profileSummary(existingTag)}
                  </span>
                ) : !complete ? (
                  <span style={{ fontSize: 13, color: theme.textMuted }}>
                    {answered} of 3 answered - saves by itself once all three are set. Switching
                    steps keeps your picks.
                  </span>
                ) : suggested ? (
                  <span style={{ fontSize: 13, color: theme.textMuted }}>
                    Suggested profile complete - tap any chip to confirm all three and save.
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- A single segmented axis (Data | Rules | Exceptions). ---------------------
interface AxisPickerProps<T extends string> {
  label: string
  question: string
  options: readonly T[]
  help: Record<T, string>
  value: T | null
  onPick: (v: T) => void
  disabled: boolean
}

function AxisPicker<T extends string>({
  label,
  question,
  options,
  help,
  value,
  onPick,
  disabled,
}: AxisPickerProps<T>): JSX.Element {
  return (
    <fieldset
      style={{
        border: 'none',
        margin: '0 0 22px',
        padding: 0,
      }}
    >
      <legend
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.accent,
          padding: 0,
          marginBottom: 4,
        }}
      >
        {label}
      </legend>
      <div style={{ fontSize: 14, color: theme.text2, marginBottom: 10 }}>{question}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((opt) => {
          const isPicked = opt === value
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onPick(opt)}
              disabled={disabled}
              aria-pressed={isPicked}
              title={help[opt]}
              style={{
                cursor: disabled ? 'default' : 'pointer',
                border: `1px solid ${isPicked ? theme.accent : theme.border}`,
                borderRadius: 8,
                padding: '9px 13px',
                fontSize: 13,
                fontWeight: isPicked ? 700 : 500,
                textAlign: 'left',
                color: isPicked ? theme.accent : theme.text,
                background: isPicked ? theme.accentSoft : '#ffffff',
                minWidth: 150,
              }}
            >
              <div style={{ textTransform: 'capitalize' }}>{opt}</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: theme.textMuted, marginTop: 2 }}>
                {help[opt]}
              </div>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** The zone's title block, shared by the empty state and the populated view. */
// Compact intro for the frame body (the frame header names the zone).
function ZoneHeader(): JSX.Element {
  return (
    <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 14px', color: theme.textMuted }}>
      Profile each step on three axes - how shaped its data is, how explicit its rules are, and how
      often exceptions bite. This is the evidence a later challenge cites.
    </p>
  )
}
