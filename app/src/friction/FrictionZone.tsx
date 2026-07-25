// M2-06 - the Zone 3 (Friction) tagging surface.
//
// This is a PURE VIEW over the M2-01 store, exactly like MapZone is for Zone 2 and
// FrameZone for Zone 1. The store is never the source of truth in the component:
// the step list reads canvas.nodes and the pinned tags read canvas.friction (both
// C9 projections of the event log), and every tag leaves the UI as a
// `friction.pinned` event.
//
//   read : store canvas (C9 projection) -> canvas.nodes / canvas.friction -> view
//   write: tap a waste chip -> buildFrictionPinnedCandidate -> store.dispatch
//
// Ids are minted HERE, at the app edge (crypto.randomUUID, a valid schema Id), the
// same boundary App.tsx mints the session id at and MapZone mints node/edge ids at;
// the store stays pure and resolves event_id/ts from its injected providers.
//
// Layering (constitution / AGENTS.md): tapping a chip makes no judgement about
// whether the friction is "right". It only shapes the candidate; the precompiled
// ajv validator inside the C8 event store decides acceptance and C9 upserts it into
// canvas.friction. No direct mutation of canvas state ever happens here.

import { useMemo, useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
// Friction/Downtime/Node are imported from the ratified schema, never redefined
// (CardContract). The chip labels come from DOWNTIME_WASTES in events.ts, itself
// typed against the imported Downtime union - one source of truth for the wastes.
import type { Downtime, Friction } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import { nodeLabel } from '../nodeLabel.js'
import { DOWNTIME_WASTES, wasteLabel, buildFrictionPinnedCandidate } from './events.js'

export interface FrictionZoneProps {
  store: StoreApi<CanvasStoreState>
}

// The step's display label comes from the ONE shared rule (nodeLabel.ts).

export function FrictionZone({ store }: FrictionZoneProps): JSX.Element {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const dispatch = useCanvasStore(store, (s) => s.dispatch)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Local note buffer, attached to the NEXT friction pinned on the selected step.
  // Typing updates only this - no event fires until a waste chip is tapped.
  const [note, setNote] = useState('')

  const nodes = canvas.nodes
  // canvas.friction is optional in the schema but always [] in the empty projection;
  // the ?? [] keeps this total without assuming the key is present.
  const friction = canvas.friction ?? []

  // The frictions already pinned to the selected step, read straight from the
  // projection (view only). Grouped by node implicitly: only the selected node's
  // group is shown at a time.
  const pinned = useMemo<Friction[]>(
    () => (selectedId === null ? [] : friction.filter((f) => f.node_id === selectedId)),
    [friction, selectedId],
  )

  const selectedNode = selectedId === null ? null : (nodes.find((n) => n.id === selectedId) ?? null)
  const canMutate = sessionId !== null

  // --- Write: tapping a waste chip produces one friction.pinned event. ----------
  const pinWaste = (waste: Downtime): void => {
    if (sessionId === null || selectedNode === null) return
    const trimmed = note.trim()
    // exactOptionalPropertyTypes: build the optional note key only when non-empty,
    // never note: undefined. id is minted at the app edge, waste + node_id from the
    // selection. ajv (in the store) still gates the final truth.
    const next: Friction = {
      id: crypto.randomUUID(),
      waste,
      node_id: selectedNode.id,
      ...(trimmed.length > 0 ? { note: trimmed } : {}),
    }
    dispatch(buildFrictionPinnedCandidate(sessionId, next))
    setNote('')
  }

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
            No steps to tag yet. Draw the process in the <strong>Map</strong> (Zone 2) first - every
            friction pins to a step, so the steps have to exist before you can tag their pain.
          </div>
        </div>
      </div>
    )
  }

  const chipBase = {
    cursor: 'pointer',
    border: `1px solid ${theme.border}`,
    borderRadius: 999,
    padding: '7px 13px',
    fontSize: 13,
    fontWeight: 600,
    background: '#ffffff',
    color: theme.text,
  } as const

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
              const count = friction.filter((f) => f.node_id === node.id).length
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
                    {count > 0 ? (
                      <span
                        aria-label={`${count} friction${count === 1 ? '' : 's'} pinned`}
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
                        {count}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Right: the selected step's DOWNTIME chips, note, and pinned frictions. */}
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
              Pick a step on the left to tag its friction.
            </p>
          ) : (
            <div style={{ maxWidth: 640 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: theme.text }}>
                {nodeLabel(selectedNode)}
              </h2>
              <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 20px' }}>
                Tap the wastes that bite on this step. Each tap pins one friction.
              </p>

              {/* Optional note, attached to the next friction you pin. */}
              <label
                htmlFor="friction-note"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: theme.text,
                  marginBottom: 4,
                }}
              >
                Note (optional) - attached to the next waste you tap
              </label>
              <input
                id="friction-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="Optional note for the next friction"
                placeholder="e.g. waits on the approver's inbox, often overnight"
                disabled={!canMutate}
                style={{
                  padding: '9px 11px',
                  fontSize: 14,
                  color: theme.text,
                  background: '#ffffff',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  width: '100%',
                  boxSizing: 'border-box',
                  marginBottom: 18,
                }}
              />

              {/* The 8 DOWNTIME wastes as tappable chips (one source: DOWNTIME_WASTES). */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
                {DOWNTIME_WASTES.map((waste) => (
                  <button
                    key={waste}
                    type="button"
                    onClick={() => pinWaste(waste)}
                    disabled={!canMutate}
                    aria-label={`Pin ${wasteLabel(waste)} friction to this step`}
                    title={waste}
                    style={chipBase}
                  >
                    {wasteLabel(waste)}
                  </button>
                ))}
              </div>

              {/* Frictions already pinned to this step (from canvas.friction). */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: theme.textMuted,
                  marginBottom: 10,
                }}
              >
                Pinned here ({pinned.length})
              </div>
              {pinned.length === 0 ? (
                <p style={{ fontSize: 14, color: theme.textMuted, margin: 0 }}>
                  Nothing pinned to this step yet.
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
                  {pinned.map((f) => (
                    <li
                      key={f.id}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 10,
                        padding: '10px 12px',
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        background: theme.surface,
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 auto',
                          fontSize: 12,
                          fontWeight: 700,
                          color: theme.accent,
                          background: theme.accentSoft,
                          border: `1px solid ${theme.accent}`,
                          borderRadius: 999,
                          padding: '2px 9px',
                        }}
                        title={f.waste}
                      >
                        {wasteLabel(f.waste)}
                      </span>
                      {f.note !== undefined && f.note.length > 0 ? (
                        <span style={{ fontSize: 14, color: theme.text }}>{f.note}</span>
                      ) : (
                        <span style={{ fontSize: 14, color: theme.textMuted, fontStyle: 'italic' }}>
                          no note
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** The zone's title block, shared by the empty state and the populated view. */
// Compact intro for the frame body (the frame header names the zone).
function ZoneHeader(): JSX.Element {
  return (
    <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 14px', color: theme.textMuted }}>
      Tag friction against the steps you mapped, using the eight wastes (DOWNTIME). Every friction
      pins to a step.
    </p>
  )
}
