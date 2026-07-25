// M2-03 - the Zone 2 (Map) drawable swimlane surface.
//
// This is a PURE VIEW over the M2-01 store. React Flow is never the source of
// truth (CardContract): it is fed by a deterministic projection of the event log
// and every mutation leaves as an event.
//
//   read : store canvas (C9 projection) -> layoutNodes/laneBands -> React Flow view
//   write: toolbar / inspector / onConnect -> event candidate -> store.dispatch
//
// Ids are minted HERE, at the app edge (crypto.randomUUID, a valid schema Id), the
// same boundary App.tsx mints the session id at; the store stays pure and resolves
// event_id/ts from its injected providers. Nodes are rendered non-draggable because
// their position is DERIVED from lane+sequence (layout.ts), never stored - dragging
// must not be able to imply persistence.

// React Flow's base stylesheet - required for correct node/edge/handle rendering.
// A side-effect import Vite inlines at build time; under the strict Solo CSP it
// loads as a same-origin stylesheet (style-src 'self' 'unsafe-inline'). It is data
// (a stylesheet), never code, so no eval/CSP rule is touched.
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, MarkerType } from '@xyflow/react'
import type { Connection, Edge as RFEdge, Node as RFNode } from '@xyflow/react'
import type { StoreApi } from 'zustand/vanilla'
import type { Node as CanvasNode, Edge as CanvasEdge, NodeType } from '@procezio/schema'
import type { ComposerNamingOutput } from '@procezio/schema'
import type { LlmClient } from '@procezio/core'
import { composeToBe, handoffCount, cycleTimeEstimate, formatDuration } from '@procezio/core'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import { toast } from '../canvas/toast.js'
import { runComposerNaming } from '../tasks/composer-name.js'
import { TokenSim } from './TokenSim.js'
import { buildToBeSnapshotAcceptedCandidate, type ToBeChangeInput } from '../composer/events.js'
import {
  buildEdgeCreatedCandidate,
  buildNodeCreatedCandidate,
  buildNodeUpdatedCandidate,
} from './events.js'
import { laneBands, layoutNodes } from './layout.js'
import { nodeTypes } from './shapes.js'
import { FlowEdge } from './FlowEdge.js'
import { laneIdFor } from '../templates/template.js'
import { Toolbar } from './Toolbar.js'
import { Inspector } from './Inspector.js'
import { EdgeDetailPanel } from './EdgeDetailPanel.js'

// A stable module-level edgeTypes registry (same rationale as nodeTypes in shapes.tsx):
// every hand-off renders through FlowEdge, whose path is computed from layout truth
// instead of DOM-measured handles (immune to the camera scale - see FlowEdge.tsx).
const edgeTypes = { flow: FlowEdge } as const

// Lane ids come from the ONE exported slugifier (templates/template.ts laneIdFor):
// template-seeded lanes and hand-typed actors MUST produce identical slugs for the
// same label, or applying a template then editing an actor splits one actor into
// two lanes. A private near-copy lived here before and was one tweak away from that.

export interface MapZoneProps {
  store: StoreApi<CanvasStoreState>
  /** The connected model (or null). At T1+ it can name the composed to-be; it never composes it. */
  client?: LlmClient | null
}

export function MapZone({ store, client }: MapZoneProps): JSX.Element {
  const canvas = useCanvasStore(store, getCanvas)
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const dispatch = useCanvasStore(store, (s) => s.dispatch)
  // Live two-ink provenance (M2-16): a pencil node is an agent draft awaiting review.
  const provenance = useCanvasStore(store, (s) => s.provenance)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  // v0.4: as-is vs the composer's read-only to-be hypothesis (spec 01b section 9).
  const [mapView, setMapView] = useState<'as-is' | 'to-be'>('as-is')
  // F2: the token-simulation overlay (own lightweight animator).
  const [simOpen, setSimOpen] = useState(false)
  // The model's optional name + narrative for the composed to-be (it labels; core composes).
  const [naming, setNaming] = useState<ComposerNamingOutput | null>(null)
  const [namingBusy, setNamingBusy] = useState(false)

  // The composed target state from committed, element-pinned opportunities. When there are
  // none, to-be equals as-is (honest - nothing to show). Deterministic; the LLM does not run.
  const composed = useMemo(() => composeToBe(canvas, canvas.opportunities ?? []), [canvas])
  const showToBe = mapView === 'to-be'
  // When the to-be has nothing to change (no committed, element-pinned idea), render the SAME
  // canvas as as-is - identical nodes, so toggling never re-fits or shifts the diagram. Only a
  // real hypothesis (composed.changes > 0) swaps in the composed structure.
  const hasToBe = composed.changes.length > 0
  const source = showToBe && hasToBe ? composed.toBe : canvas
  const changedRefs = useMemo(() => new Set(composed.changes.map((c) => c.element_ref)), [composed])

  // The model's name/narrative describes ONE specific composition. If the composition
  // changes (ideas committed/uncommitted, pins moved, another session loaded into this
  // mounted zone), the old name is stale - it must never ride into acceptSnapshot's
  // permanent event, so it resets and the "Name this to-be" button returns.
  const compositionKey = useMemo(
    () => composed.changes.map((c) => `${c.opportunity_id}:${c.element_ref}:${c.rung}`).join('|'),
    [composed],
  )
  useEffect(() => {
    setNaming(null)
  }, [compositionKey, store])

  const canMutate = sessionId !== null

  // Targeted delete (the hover ✕ on a shape / the handoff panel): a C10 compensation of
  // the element's creation chain - node deletion cascades to its connected edges in the
  // store. Stable identities (store is per-session) so the baseNodes memo keeps paying off.
  const deleteNode = useCallback(
    (nodeId: string) => {
      const label = store.getState().canvas.nodes.find((n) => n.id === nodeId)?.label
      store.getState().removeElement('node', nodeId)
      setSelectedId((cur) => (cur === nodeId ? null : cur))
      toast(`Removed "${label ?? 'step'}" and everything pinned to it. Redo restores it.`)
    },
    [store],
  )

  const deleteEdge = useCallback(
    (edgeId: string) => {
      store.getState().removeElement('edge', edgeId)
      setSelectedEdgeId((cur) => (cur === edgeId ? null : cur))
      toast('Removed the handoff. Redo restores it.')
    },
    [store],
  )

  // The React Flow node array, built in two memo layers so a CLICK never pays for
  // LAYOUT: the base layer (bands + positioned shapes) recomputes only when the
  // projection changes; selection is painted on afterwards, replacing only the one
  // selected node's object. Unselected nodes keep their identity, so the memo-wrapped
  // shape components skip re-rendering them entirely.
  const baseNodes = useMemo<RFNode[]>(() => {
    const bands = laneBands(source).map<RFNode>((b) => ({
      id: `lane-${b.id}`,
      type: 'lane',
      position: { x: b.x, y: b.y },
      data: { actor: b.actor },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: 0,
      // pointerEvents:none on the whole band wrapper so a click on an edge crossing the band
      // reaches the edge (opens the Handoff panel) instead of being swallowed by the band.
      style: { width: b.width, height: b.height, pointerEvents: 'none' },
    }))
    const positions = new Map(layoutNodes(source).map((p) => [p.id, p]))
    const shapes = source.nodes.map<RFNode>((node) => {
      const pos = positions.get(node.id)
      return {
        id: node.id,
        type: node.type,
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        data: {
          label: node.label,
          nodeType: node.type,
          metadata: node.metadata,
          // In the to-be view a changed element is pencil (a composed hypothesis); in as-is,
          // provenance drives it.
          pencil: showToBe
            ? changedRefs.has(node.id)
            : provenance.get(`node:${node.id}`)?.state === 'pencil',
          // The hover ✕: only where a delete can actually land (a live session, the
          // editable as-is view) - the to-be hypothesis stays strictly read-only.
          ...(canMutate && !showToBe ? { onDelete: deleteNode } : {}),
        },
        draggable: false,
        selected: false,
        zIndex: 1,
      }
    })
    return [...bands, ...shapes]
  }, [source, showToBe, changedRefs, provenance, canMutate, deleteNode])

  const rfNodes = useMemo<RFNode[]>(
    () =>
      selectedId === null
        ? baseNodes
        : baseNodes.map((n) => (n.id === selectedId ? { ...n, selected: true } : n)),
    [baseNodes, selectedId],
  )

  // React Flow edges are a direct read of the projected edges (view only). In the to-be view
  // they come from the composed source; a re-key medium is labelled so the handoff reads.
  // Rendered through FlowEdge as orthogonal connectors with an arrowhead, so the map reads as
  // a process diagram - clean right-angle hand-offs computed from layout truth, never from
  // DOM measurement. A re-key hand-off is drawn dashed + rust to flag the friction the way
  // the prototype does.
  const rfEdges = useMemo<RFEdge[]>(
    () =>
      source.edges.map((e) => {
        const rekey = e.medium === 're-key'
        const stroke = rekey ? '#A5432D' : theme.text
        const label = e.label ?? e.medium
        return {
          id: e.id,
          source: e.from,
          target: e.to,
          type: 'flow',
          // A wide invisible hit-path so the thin connector is easy to click (opens the Handoff
          // panel). Without this a 1.5px line is fiddly to hit.
          interactionWidth: 26,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
          style: {
            stroke,
            strokeWidth: rekey ? 2 : 1.5,
            ...(rekey ? { strokeDasharray: '5 4' } : {}),
          },
          ...(label !== undefined ? { label } : {}),
          labelStyle: { fontSize: 11, fill: theme.textMuted },
          labelBgStyle: { fill: theme.surface, fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        }
      }),
    [source],
  )

  // --- Writes: every handler produces an event; none touches canvas state. -----

  const addShape = (type: NodeType, actor: string): void => {
    if (sessionId === null) return
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      type,
      lane: laneIdFor(actor),
      label: type,
      zone: 2,
    }
    dispatch(buildNodeCreatedCandidate(sessionId, node))
  }

  const connect = (c: Connection): void => {
    if (sessionId === null || !c.source || !c.target) return
    dispatch(
      buildEdgeCreatedCandidate(sessionId, {
        id: crypto.randomUUID(),
        from: c.source,
        to: c.target,
        kind: 'sequence',
      }),
    )
  }

  const saveNode = (next: CanvasNode): void => {
    if (sessionId === null) return
    dispatch(buildNodeUpdatedCandidate(sessionId, next))
  }

  // v0.4: an edge is a handoff object; an edit is a same-id edge upsert (edge.created).
  const saveEdge = (next: CanvasEdge): void => {
    if (sessionId === null) return
    dispatch(buildEdgeCreatedCandidate(sessionId, next))
  }

  const selectedNode =
    selectedId === null ? null : (canvas.nodes.find((n) => n.id === selectedId) ?? null)
  const selectedEdge =
    selectedEdgeId === null ? null : (canvas.edges.find((e) => e.id === selectedEdgeId) ?? null)

  // Accept the composed to-be snapshot into the case: one tobe.snapshot.accepted per
  // opportunity that changed, carrying its changes + the handoff delta.
  const acceptSnapshot = (): void => {
    if (sessionId === null) return
    const byOpp = new Map<string, ToBeChangeInput[]>()
    for (const c of composed.changes) {
      const list = byOpp.get(c.opportunity_id) ?? []
      list.push({ element_ref: c.element_ref, rung: c.rung, note: c.note })
      byOpp.set(c.opportunity_id, list)
    }
    for (const [oppId, changes] of byOpp) {
      // Each event carries the delta of ITS opportunity's transforms alone - stamping
      // the global cross-opportunity delta into every event over-attributed the whole
      // improvement to each idea (double-counting for any per-opportunity consumer).
      const own = (canvas.opportunities ?? []).filter((o) => o.id === oppId)
      const ownDelta = composeToBe(canvas, own).delta
      dispatch(
        buildToBeSnapshotAcceptedCandidate(
          sessionId,
          oppId,
          changes,
          ownDelta,
          naming ?? undefined,
        ),
      )
    }
    toast('Snapshot accepted into the case - as-is vs to-be with the delta and its assumptions.')
  }

  // The model names the composed to-be (T1+, connected). It labels only; core already composed
  // the structure and the delta. On any failure the snapshot is still fully usable, just unnamed.
  const nameToBe = (): void => {
    if (client === null || client === undefined || composed.changes.length === 0) return
    setNamingBusy(true)
    void runComposerNaming(client, canvas, composed)
      .then((out) => {
        if (out !== null) {
          setNaming(out)
          toast(`Named the to-be: "${out.name}" - a hypothesis to test, not a promise.`)
        }
      })
      .finally(() => setNamingBusy(false))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <Toolbar onAddShape={addShape} disabled={!canMutate} />
      {/* v0.4 as-is / to-be toggle + delta (spec 01b section 9). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: 10,
          padding: '5px 10px',
          borderBottom: `1px solid ${theme.border}`,
          fontSize: 12,
        }}
      >
        <div
          role="group"
          aria-label="Map view"
          style={{
            display: 'flex',
            border: `1px solid ${theme.border}`,
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          {(['as-is', 'to-be'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setMapView(v)
                setSelectedId(null)
                setSelectedEdgeId(null)
              }}
              aria-pressed={mapView === v}
              style={{
                padding: '3px 11px',
                border: 'none',
                cursor: 'pointer',
                background:
                  mapView === v ? (v === 'to-be' ? theme.pencil : theme.text) : 'transparent',
                color: mapView === v ? '#fff' : theme.textMuted,
              }}
            >
              {v === 'to-be' ? 'to-be ✎' : 'as-is'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const steps = source.nodes.filter((n) => n.type === 'Step').length
            const handoffs = handoffCount(source)
            // F1: fold in readable tagged times for a cycle-time estimate + the biggest wait.
            const ct = cycleTimeEstimate(source)
            const timePart =
              ct.counted > 0
                ? ` Est. cycle time ${formatDuration(ct.total_minutes)} (from ${ct.counted} timed ${ct.counted === 1 ? 'field' : 'fields'}${ct.skipped > 0 ? `, ${ct.skipped} unread` : ''})${ct.biggest_wait ? `; biggest wait: ${ct.biggest_wait.label}` : ''}.`
                : ' Add touch/wait times on nodes for a cycle-time estimate.'
            toast(
              `Flow: ${source.nodes.length} nodes (${steps} steps), ${handoffs} handoff${handoffs === 1 ? '' : 's'}.${timePart} Estimate from the map, not a measurement.`,
            )
          }}
          style={{
            border: `1px solid ${theme.border}`,
            background: '#fff',
            borderRadius: 14,
            padding: '3px 11px',
            fontSize: 11.5,
            cursor: 'pointer',
            color: theme.text,
          }}
        >
          ▶ Watch the flow
        </button>
        <button
          type="button"
          onClick={() => setSimOpen(true)}
          style={{
            border: `1px solid ${theme.border}`,
            background: '#fff',
            borderRadius: 14,
            padding: '3px 11px',
            fontSize: 11.5,
            cursor: 'pointer',
            color: theme.text,
          }}
        >
          ⦿ Play token
        </button>
        {showToBe &&
          (hasToBe ? (
            <>
              <span
                style={{
                  color: theme.pencil,
                  flex: '1 1 0',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {naming ? `“${naming.name}” · ` : ''}Δ hypothesis · handoffs{' '}
                {composed.delta.handoff_count && composed.delta.handoff_count > 0 ? '+' : ''}
                {composed.delta.handoff_count ?? 0} · not a promise
              </span>
              {client && naming === null && (
                <button
                  type="button"
                  onClick={nameToBe}
                  disabled={namingBusy}
                  style={{
                    border: `1px solid ${theme.border}`,
                    background: '#fff',
                    borderRadius: 14,
                    padding: '3px 11px',
                    fontSize: 11.5,
                    cursor: namingBusy ? 'default' : 'pointer',
                    color: theme.text,
                  }}
                >
                  {namingBusy ? 'Naming…' : '✎ Name this to-be'}
                </button>
              )}
              <button
                type="button"
                onClick={acceptSnapshot}
                style={{
                  marginLeft: 'auto',
                  border: `1px solid ${theme.accent}`,
                  background: theme.accent,
                  color: theme.onAccent,
                  borderRadius: 14,
                  padding: '3px 11px',
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                Accept snapshot into case
              </button>
            </>
          ) : (
            <span
              style={{
                color: theme.textMuted,
                flex: '1 1 0',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title="Commit an idea and pin it to a step to compose a to-be."
            >
              No committed, element-pinned ideas yet - pin one to compose a to-be.
            </span>
          ))}
      </div>
      <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, position: 'relative', background: theme.bg }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            {...(showToBe ? {} : { onConnect: connect })}
            onNodeClick={(_event, node) => {
              if (node.type === 'lane' || showToBe) return
              setSelectedEdgeId(null)
              setSelectedId(node.id)
            }}
            onEdgeClick={(_event, edge) => {
              if (showToBe) return
              setSelectedId(null)
              setSelectedEdgeId(edge.id)
            }}
            onPaneClick={() => {
              setSelectedId(null)
              setSelectedEdgeId(null)
            }}
            nodesDraggable={false}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color={theme.border} gap={22} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {selectedNode !== null ? (
          <Inspector node={selectedNode} onSave={saveNode} onClose={() => setSelectedId(null)} />
        ) : selectedEdge !== null ? (
          <EdgeDetailPanel
            edge={selectedEdge}
            canvas={canvas}
            onSave={saveEdge}
            onDelete={deleteEdge}
            onClose={() => setSelectedEdgeId(null)}
          />
        ) : null}
      </div>
      {simOpen && <TokenSim canvas={source} onClose={() => setSimOpen(false)} />}
    </div>
  )
}
