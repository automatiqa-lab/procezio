// C9 - the projection layer for @procezio/core.
//
// Projection is the READ side of the event-sourced core (specs/02 s.4,
// specs/02b C3): a pure, deterministic fold of the immutable event log into
// canvas state. It owns one invariant - given the same ordered events it always
// produces byte-identical state - and it owns the disposable-snapshot cache that
// makes long logs cheap to load.
//
// Layering (constitution / AGENTS.md): projection makes NO generative judgement.
// It never decides whether an event "should" apply; it deterministically folds
// what the log already committed. The event store decided ordering and validity
// upstream (C8); projection only replays.
//
// Isomorphic by construction: this file imports nothing from node:* and reads no
// files or clocks. Every value the canvas carries comes from an event payload,
// never from Date.now() or Math.random(), so the identical module runs in the
// browser Solo bundle and in the Node relay and replays to the same state in
// both. structuredClone is a platform global (browser + Node >=17), not a
// node:* import, and is deterministic - used only to avoid aliasing the caller's
// event objects into the output and to hand back independent snapshot copies.

import type {
  Canvas,
  Edge,
  EventEnvelope,
  Lane,
  Node,
  Phase,
  Provenance,
  Zone,
} from '@procezio/schema'
// The additive/state-building payload families. Imported from the ratified
// schema, never redefined here, so a payload cast cannot drift from the contract
// the store validated the event against. FlagPayload is imported for the same
// reason - the flag.accepted branch reads its decision, it does not redefine it.
import type {
  AssumptionAddedPayload,
  AuditTagPayload,
  CasePayload,
  EdgePayload,
  FlagPayload,
  FramePayload,
  FrictionPayload,
  GatePayload,
  NodePayload,
  OpportunityPayload,
  ScoreCommittedPayload,
  PersonaAnnotatedPayload,
  PersonaDefinedPayload,
  SessionPayload,
  SimulatedPerspective,
  ShoeboxItem,
  ShoeboxItemAddedPayload,
  ShoeboxItemConsentedPayload,
  StepReassignedPayload,
  ZonePayload,
} from '@procezio/schema'

/**
 * A disposable projected-state cache record: the canvas as it stood at `seq`.
 * Snapshots are a cache ONLY - never the source of truth. The event log is truth
 * (specs/02b C3); a snapshot is a re-derivable shortcut. This module never
 * persists them; the caller (event store / relay) holds them and may discard
 * them at any time, after which `project` from seq 1 reproduces identical state.
 */
export interface Snapshot {
  seq: number
  canvas: Canvas
}

/**
 * Snapshot cadence. `snapshotEvery` matches specs/02 s.4 ("taken every 200
 * events or on zone-complete"): a snapshot is captured at every seq that is a
 * multiple of N and, additionally, on every `zone.completed` event.
 */
export interface ProjectionOptions {
  snapshotEvery?: number
}

/** specs/02 s.4 default: snapshot every 200 events. */
const DEFAULT_SNAPSHOT_EVERY = 200

/**
 * Fold an ordered event log into canvas state. Pure and deterministic: no
 * mutation of the input, no clock, no randomness - the same events in the same
 * order always yield byte-identical state.
 */
export function project(events: readonly EventEnvelope[]): Canvas {
  // Index by id ONCE so the fold can resolve a compensating event's target (and
  // walk a compensates chain) in O(1) without rescanning the log. Built from the
  // full array project() receives, so every referenced target - including the
  // undo events a redo points at - resolves within this call. The raw array is
  // never mutated; the target event stays in the log.
  const byId = indexById(events)
  let canvas = emptyCanvas()
  for (const event of events) {
    canvas = reduce(canvas, event, byId)
  }
  return canvas
}

/**
 * Capture disposable snapshots while folding. Returns a snapshot at every seq
 * that is a multiple of `snapshotEvery` and at every `zone.completed` event.
 * Each snapshot holds an independent (cloned) canvas copy so it is safe to cache
 * and later discard. Snapshots never serve as truth - they only shortcut a later
 * `loadFromSnapshot`.
 */
export function takeSnapshot(
  events: readonly EventEnvelope[],
  options?: ProjectionOptions,
): Snapshot[] {
  const every = options?.snapshotEvery ?? DEFAULT_SNAPSHOT_EVERY
  const snapshots: Snapshot[] = []
  const byId = indexById(events)
  let canvas = emptyCanvas()
  for (const event of events) {
    canvas = reduce(canvas, event, byId)
    const onInterval = every > 0 && event.seq % every === 0
    const onZoneCompleted = event.type === 'zone.completed'
    if (onInterval || onZoneCompleted) {
      snapshots.push({ seq: event.seq, canvas: structuredClone(canvas) })
    }
  }
  return snapshots
}

/**
 * Load = latest snapshot + tail replay (specs/02 s.4). Folds `tail` (the events
 * with seq K+1..N) onto a fresh copy of `snapshot.canvas` (state at seq K). By
 * construction this runs the SAME per-event fold as `project`, so
 * `loadFromSnapshot(snapshotAtK, tailK+1..N)` equals `project(allEvents1..N)` -
 * the isomorphism is structural, not incidental. The snapshot is cloned first so
 * loading never mutates the cached record (snapshots stay disposable/reusable).
 */
export function loadFromSnapshot(snapshot: Snapshot, tail: readonly EventEnvelope[]): Canvas {
  // Scope note (called out for review, specs/02 s.4): the id index is built from
  // `tail` alone, so a compensating/flag-rejected event in the tail whose target
  // predates the snapshot boundary cannot resolve here. project()/takeSnapshot()
  // always fold the complete log and remain the correctness authority; no
  // acceptance criterion or fixture exercises the snapshot-crossing undo, so this
  // is a documented boundary, not a silent gap.
  const byId = indexById(tail)
  let canvas = structuredClone(snapshot.canvas)
  for (const event of tail) {
    canvas = reduce(canvas, event, byId)
  }
  return canvas
}

// --- The fold step ------------------------------------------------------------

/**
 * Fold one event, resolving undo/redo first. If the event is a compensation
 * (it carries `compensates`, OR it is a flag.accepted whose decision is
 * 'rejected' - the two removal triggers, unified onto one path), its net effect
 * is decided by chain parity rather than by re-applying it as its own family:
 * an odd number of stacked compensations removes the origin's effect, an even
 * number re-applies it (compensation-of-a-compensation = redo). Otherwise the
 * event is folded additively by its family.
 *
 * The input canvas is never mutated, so repeated runs and snapshot reuse are safe.
 */
function reduce(
  canvas: Canvas,
  event: EventEnvelope,
  byId: ReadonlyMap<string, EventEnvelope>,
): Canvas {
  const comp = resolveCompensation(event, byId)
  if (comp) {
    // The target chain could not resolve (e.g. tail-only load across a snapshot
    // boundary): leave state untouched rather than guess.
    if (!comp.origin) {
      return canvas
    }
    // Odd depth = net removal (undo); even depth = net re-application (redo). A
    // compensating event carries its target's family+payload, so applyEffect /
    // removeEffect operate on the ORIGIN event, reversing or restoring exactly
    // the effect the origin first produced.
    return comp.remove ? removeEffect(canvas, comp.origin) : applyEffect(canvas, comp.origin)
  }
  return applyEffect(canvas, event)
}

/**
 * Apply one event's ADDITIVE effect to the canvas, returning a NEW canvas (the
 * input is never mutated). Handles the ten additive/state-building families
 * (session, zone, node, edge, friction, audit_tag, opportunity, score.committed,
 * plus the v0.3 frame.set and assumption.added); every other family is an
 * audit/interaction event with no field in the Canvas ontology and leaves state
 * unchanged. Extracted from the fold so a redo can re-apply an origin's effect
 * through the identical code path as the first apply.
 */
function applyEffect(canvas: Canvas, event: EventEnvelope): Canvas {
  switch (event.type) {
    case 'session.started': {
      const p = event.payload as SessionPayload
      // Only the process NAME is carried by the event; the remaining Process
      // fields (trigger/end_state/owner/north_star) are zone-1 detail not
      // present in this family, so they keep their (empty) defaults rather than
      // being invented here. schema_version is taken from the envelope.
      return {
        ...canvas,
        schema_version: event.schema_version,
        process: { ...canvas.process, name: p.process_name },
      }
    }
    case 'zone.completed': {
      const p = event.payload as ZonePayload
      // The event carries id and (usually) phase; the zone's display name is not
      // in this family, so it defaults to empty rather than being fabricated.
      // Phase falls back to the fixed structural mapping only if the event omits
      // it (Understand -> Diverge -> Converge is the canvas's fixed pedagogy).
      const zone: Zone = {
        id: p.zone_id,
        phase: p.phase ?? phaseForZone(p.zone_id),
        name: '',
      }
      return { ...canvas, zones: upsertBy(canvas.zones, zone, (z) => z.id) }
    }
    case 'node.created': {
      const p = event.payload as NodePayload
      const node: Node = structuredClone(p.node)
      // v0.3 lane-actor mechanism: the creating event may carry an explicit actor
      // label for the node's lane (NodePayload.actor), independent of the id slug.
      // When present it labels the derived lane; when absent ensureLane falls back
      // to the lane id, preserving the prior behaviour exactly.
      return {
        ...canvas,
        nodes: upsertBy(canvas.nodes, node, (n) => n.id),
        lanes: ensureLane(canvas.lanes, node.lane, p.actor),
      }
    }
    case 'edge.created': {
      const p = event.payload as EdgePayload
      const edge: Edge = structuredClone(p.edge)
      return { ...canvas, edges: upsertBy(canvas.edges, edge, (e) => e.id) }
    }
    case 'step.reassigned': {
      // v0.4 (KRH5w5KrRemQ): the one geometry act with semantic weight. A confirmed
      // vertical drag across a lane boundary moves the step to a new owner, so the node's
      // lane changes and the destination lane is ensured. Position is presentation; only
      // this lane change is content. An unknown target node is a no-op (don't guess).
      const p = event.payload as StepReassignedPayload
      const nodes = canvas.nodes.map((n) => (n.id === p.node_id ? { ...n, lane: p.to_lane } : n))
      return { ...canvas, nodes, lanes: ensureLane(canvas.lanes, p.to_lane) }
    }
    case 'friction.pinned': {
      const p = event.payload as FrictionPayload
      const friction = upsertBy(canvas.friction ?? [], structuredClone(p.friction), (f) => f.id)
      return { ...canvas, friction }
    }
    case 'audit_tag.set': {
      const p = event.payload as AuditTagPayload
      const audit_tags = upsertBy(
        canvas.audit_tags ?? [],
        structuredClone(p.audit_tag),
        (a) => a.id,
      )
      return { ...canvas, audit_tags }
    }
    case 'opportunity.created': {
      const p = event.payload as OpportunityPayload
      const opportunities = upsertBy(
        canvas.opportunities ?? [],
        structuredClone(p.opportunity),
        (o) => o.id,
      )
      return { ...canvas, opportunities }
    }
    case 'score.committed': {
      const p = event.payload as ScoreCommittedPayload
      // The anti-anchoring trigger: attach the committed score to its
      // opportunity and mark it committed. Non-matching opportunities pass
      // through unchanged, array order preserved (deterministic).
      const opportunities = (canvas.opportunities ?? []).map((o) =>
        o.id === p.opportunity_id ? { ...o, score: structuredClone(p.score), committed: true } : o,
      )
      return { ...canvas, opportunities }
    }
    case 'frame.set': {
      const p = event.payload as FramePayload
      // v0.3 zone-1 Frame patch. FramePayload mirrors Process with every field
      // optional, so this is a PARTIAL patch, not a replace: spread only the keys
      // the event actually carries over the current process. The payload is a plain
      // JSON object, so an unset Frame field is an ABSENT key (never an explicit
      // undefined) and the spread cannot blank a value the process already holds.
      return { ...canvas, process: { ...canvas.process, ...p } }
    }
    case 'assumption.added': {
      const p = event.payload as AssumptionAddedPayload
      // v0.3 A2 assumption ledger, amended v0.4 (2026-07-24): an entry MAY carry an
      // optional id, which makes assumption.added an in-place upsert - the mechanism
      // that lets a verify plan be added AFTER flagging (the export gate's demand
      // was otherwise unactionable). Match rules, in order:
      //   1. same id            -> replace in place (the ordinary upsert);
      //   2. incoming HAS an id, an existing entry has NONE but the same
      //      statement+source -> replace it (acknowledging a pre-amendment entry
      //      adopts it, id and all);
      //   3. otherwise         -> append in log order, exactly as before.
      // Pre-amendment logs carry no ids, so every historical event follows rule 3
      // and replays byte-identically.
      const incoming = structuredClone(p.assumption)
      const list = canvas.assumptions ?? []
      const idx =
        incoming.id === undefined
          ? -1
          : list.findIndex(
              (a) =>
                a.id === incoming.id ||
                (a.id === undefined &&
                  a.statement === incoming.statement &&
                  a.source === incoming.source),
            )
      return {
        ...canvas,
        assumptions:
          idx === -1 ? [...list, incoming] : list.map((a, i) => (i === idx ? incoming : a)),
      }
    }
    case 'gate.checked': {
      const p = event.payload as GatePayload
      // M2-AMD2 zone-7 risk gate. The flat payload IS the stored Gate. Upsert by the
      // (opportunity, check) composite key: re-checking a check replaces its status
      // in place rather than stacking a second row. A case is blocked (zone 8) while
      // any of an opportunity's checks is still 'open'.
      const gates = upsertBy(
        canvas.gates ?? [],
        structuredClone(p),
        (g) => `${g.opportunity_id}::${g.check}`,
      )
      return { ...canvas, gates }
    }
    case 'case.drafted': {
      const p = event.payload as CasePayload
      // M2-AMD2 zone-8 business case. One draft per opportunity: upsert by
      // opportunity_id, so a redraft replaces the prior draft in place.
      const cases = upsertBy(canvas.cases ?? [], structuredClone(p), (c) => c.opportunity_id)
      return { ...canvas, cases }
    }
    case 'shoebox.item.added': {
      // v0.4 section 7: a note or file enters the Shoebox (upsert by item_id). Born
      // unconsented - its content reaches no model until a shoebox.item.consented arrives.
      const p = event.payload as ShoeboxItemAddedPayload
      const item: ShoeboxItem = {
        item_id: p.item_id,
        kind: p.kind,
        ...(p.name !== undefined ? { name: p.name } : {}),
        ...(p.content_type !== undefined ? { content_type: p.content_type } : {}),
      }
      return { ...canvas, shoebox: upsertBy(canvas.shoebox ?? [], item, (s) => s.item_id) }
    }
    case 'shoebox.item.consented': {
      // The per-file egress opt-in: flip consented on the matching item, leaving the rest.
      const p = event.payload as ShoeboxItemConsentedPayload
      const shoebox = (canvas.shoebox ?? []).map((s) =>
        s.item_id === p.item_id ? { ...s, consented: true } : s,
      )
      return { ...canvas, shoebox }
    }
    case 'persona.defined': {
      // Wave 2 B4: the user defines/edits a stakeholder persona (upsert by id).
      const p = event.payload as PersonaDefinedPayload
      return {
        ...canvas,
        stakeholder_personas: upsertBy(canvas.stakeholder_personas ?? [], p.persona, (sp) => sp.id),
      }
    }
    case 'persona.annotated': {
      // A simulated-perspective annotation joins the ledger (upsert by its own id). Always
      // rehearsal until confirmed; the export gate flags any unconfirmed entry.
      const p = event.payload as PersonaAnnotatedPayload
      const entry: SimulatedPerspective = {
        id: p.id,
        persona_id: p.persona_id,
        text: p.text,
        ...(p.anchor_ref !== undefined ? { anchor_ref: p.anchor_ref } : {}),
        ...(p.cited_refs !== undefined ? { cited_refs: p.cited_refs } : {}),
        ...(p.confirmed !== undefined ? { confirmed: p.confirmed } : {}),
      }
      return {
        ...canvas,
        simulated_perspectives: upsertBy(canvas.simulated_perspectives ?? [], entry, (e) => e.id),
      }
    }
    default:
      // challenge.*, flag.*, rule.fired, budget.*, agent.message: audit/interaction families
      // with no additive field in the Canvas ontology. They are part of the log's truth but
      // do not build canvas state, so the fold leaves it untouched.
      return canvas
  }
}

/**
 * Reverse one origin event's ADDITIVE effect, returning a NEW canvas. Symmetric
 * to applyEffect: it deletes the element applyEffect inserted, by the SAME id key.
 * Only the by-id array families are reversible (zone/node/edge/friction/audit_tag/
 * opportunity). session.started and score.committed mutate scalar/embedded state
 * with no standalone element to remove; gate.checked and case.drafted (M2-AMD2)
 * upsert in place by a composite/opportunity key, so inverting the last one cannot
 * restore the prior value without history - like score.committed, compensating them
 * is out of C10 scope. They (and non-additive families) leave state untouched. A removed node's derived
 * lane is intentionally kept - lanes are shared across nodes, and a later redo
 * re-adds the node into the still-present lane, so redo == original.
 */
function removeEffect(canvas: Canvas, origin: EventEnvelope): Canvas {
  switch (origin.type) {
    case 'zone.completed': {
      const p = origin.payload as ZonePayload
      return { ...canvas, zones: canvas.zones.filter((z) => z.id !== p.zone_id) }
    }
    case 'node.created': {
      const p = origin.payload as NodePayload
      return { ...canvas, nodes: canvas.nodes.filter((n) => n.id !== p.node.id) }
    }
    case 'edge.created': {
      const p = origin.payload as EdgePayload
      return { ...canvas, edges: canvas.edges.filter((e) => e.id !== p.edge.id) }
    }
    case 'friction.pinned': {
      const p = origin.payload as FrictionPayload
      return {
        ...canvas,
        friction: (canvas.friction ?? []).filter((f) => f.id !== p.friction.id),
      }
    }
    case 'audit_tag.set': {
      const p = origin.payload as AuditTagPayload
      return {
        ...canvas,
        audit_tags: (canvas.audit_tags ?? []).filter((a) => a.id !== p.audit_tag.id),
      }
    }
    case 'opportunity.created': {
      const p = origin.payload as OpportunityPayload
      return {
        ...canvas,
        opportunities: (canvas.opportunities ?? []).filter((o) => o.id !== p.opportunity.id),
      }
    }
    case 'step.reassigned': {
      // Reversible only when the origin recorded where the step came from: restore the node
      // to from_lane. Without it there is nothing to restore to, so leave state untouched
      // rather than guess (same posture as the upsert-in-place families).
      const p = origin.payload as StepReassignedPayload
      if (p.from_lane === undefined) return canvas
      const fromLane = p.from_lane
      const nodes = canvas.nodes.map((n) => (n.id === p.node_id ? { ...n, lane: fromLane } : n))
      return { ...canvas, nodes }
    }
    default:
      return canvas
  }
}

// --- Compensation resolution --------------------------------------------------

/**
 * The resolved intent of a compensating event: WHICH origin element event to
 * act on, and whether the net effect is a removal (undo) or a re-application
 * (redo). `origin` is undefined only when the chain cannot be resolved within the
 * events available to this fold (see loadFromSnapshot's scope note).
 */
interface Compensation {
  origin: EventEnvelope | undefined
  remove: boolean
}

/**
 * Decide whether `event` is a compensation and, if so, resolve it. The effective
 * target is `event.compensates` (a generic undo/redo) OR, for a flag.accepted
 * whose decision is 'rejected', payload.target_event_id (a rejection removes the
 * pencil contribution "like compensation"). Returns null for a normal additive or
 * pass-through event.
 *
 * Parity: total = (compensation links already stacked on the target) + 1 (this
 * event). Odd total => net removal, even total => net re-application. This single
 * rule makes undo, redo, and deeper undo/redo chains fall out without special-
 * casing any fixed depth.
 */
function resolveCompensation(
  event: EventEnvelope,
  byId: ReadonlyMap<string, EventEnvelope>,
): Compensation | null {
  let targetId: string | null = event.compensates ?? null
  if (targetId === null && event.type === 'flag.accepted') {
    const p = event.payload as FlagPayload
    if (p.decision === 'rejected') {
      targetId = p.target_event_id
    }
  }
  if (targetId === null) {
    return null
  }

  // Walk from the target down its `compensates` chain to the origin (the event
  // with compensates == null), counting the links already stacked on the target.
  let current = byId.get(targetId)
  let stacked = 0
  while (current && current.compensates != null) {
    stacked += 1
    current = byId.get(current.compensates)
  }
  const total = stacked + 1
  return { origin: current, remove: total % 2 === 1 }
}

/** Index events by event_id for O(1) target/chain lookups within one fold. */
function indexById(events: readonly EventEnvelope[]): ReadonlyMap<string, EventEnvelope> {
  const map = new Map<string, EventEnvelope>()
  for (const event of events) {
    map.set(event.event_id, event)
  }
  return map
}

// --- Provenance projection ----------------------------------------------------

/**
 * The `${family}:${elementId}` key an additive event creates, or null for a
 * non-additive event. Namespaced by family so a node and a zone that share an id
 * never collide. session.started/score.committed create no standalone element and
 * return null.
 */
function elementKeyOf(event: EventEnvelope): string | null {
  switch (event.type) {
    case 'node.created':
      return `node:${(event.payload as NodePayload).node.id}`
    case 'edge.created':
      return `edge:${(event.payload as EdgePayload).edge.id}`
    case 'friction.pinned':
      return `friction:${(event.payload as FrictionPayload).friction.id}`
    case 'audit_tag.set':
      return `audit_tag:${(event.payload as AuditTagPayload).audit_tag.id}`
    case 'opportunity.created':
      return `opportunity:${(event.payload as OpportunityPayload).opportunity.id}`
    case 'zone.completed':
      return `zone:${(event.payload as ZonePayload).zone_id}`
    default:
      return null
  }
}

/**
 * Project each canvas element's CURRENT two-ink provenance (constitution p5).
 * Additive and Canvas-shape-only, so project()'s signature and the whole C9
 * acceptance test are untouched: this is a separate read over the same log.
 *
 * Per element key it tracks the live Provenance, starting from the creating
 * event's own born state (already 'pencil' for an agent, 'ink' for a human, by
 * the store's birth rule):
 *  - a flag.accepted/accepted flips the target element to 'ink', stamping
 *    accepted_by (the accepting author) and accepted_at (the flag event ts) -
 *    both taken from the event, never from a clock;
 *  - a flag.accepted/rejected (resolved as a compensation) removes the element's
 *    entry, mirroring the canvas removal;
 *  - a generic undo removes the element's entry, a redo restores its born state.
 *
 * Provenance is imported verbatim from @procezio/schema and held in this external
 * map, never redefined nor bolted onto the ontology objects (which carry no
 * provenance field in the ratified schema).
 */
export function provenanceOf(events: readonly EventEnvelope[]): ReadonlyMap<string, Provenance> {
  const byId = indexById(events)
  const prov = new Map<string, Provenance>()
  for (const event of events) {
    // Undo/redo and flag-rejection resolve through the same parity rule as the
    // canvas, so provenance tracks the canvas: gone when removed, restored to the
    // origin's born state when re-applied.
    const comp = resolveCompensation(event, byId)
    if (comp) {
      if (comp.origin) {
        const key = elementKeyOf(comp.origin)
        if (key !== null) {
          if (comp.remove) {
            prov.delete(key)
          } else {
            prov.set(key, structuredClone(comp.origin.provenance))
          }
        }
      }
      continue
    }
    if (event.type === 'flag.accepted') {
      // decision:'rejected' was handled above as a compensation; only 'accepted'
      // reaches here. Flip the target element from pencil to ink.
      const p = event.payload as FlagPayload
      if (p.decision === 'accepted') {
        const target = byId.get(p.target_event_id)
        const key = target ? elementKeyOf(target) : null
        if (key !== null && prov.has(key)) {
          prov.set(key, {
            state: 'ink',
            accepted_by: event.author.id,
            accepted_at: event.ts,
          })
        }
      }
      continue
    }
    const key = elementKeyOf(event)
    if (key !== null) {
      prov.set(key, structuredClone(event.provenance))
    }
  }
  return prov
}

// --- Pure helpers -------------------------------------------------------------

/**
 * Upsert `item` into `arr` by a stable key, returning a NEW array. Insert at the
 * end when the key is unseen; replace in place (same index) when it already
 * exists. Insertion order is preserved so JSON serialization is stable across
 * runs - the basis of "byte-identical" replay.
 */
function upsertBy<T>(arr: readonly T[], item: T, key: (x: T) => string | number): T[] {
  const k = key(item)
  const index = arr.findIndex((x) => key(x) === k)
  if (index === -1) {
    return [...arr, item]
  }
  const next = arr.slice()
  next[index] = item
  return next
}

/**
 * Derive lanes from node.lane values: ensure a lane exists for `laneId`. An
 * optional `actor` label (carried by the creating NodePayload.actor, v0.3) sets
 * the swimlane actor independently of the id slug. When no non-empty actor is
 * supplied the actor defaults to the lane id - a deterministic value derived from
 * event data, not invented - preserving the pre-amendment behaviour. A lane that
 * already exists is never relabelled: the first node.created for a lane fixes its
 * actor, keeping the fold order-deterministic.
 */
function ensureLane(lanes: readonly Lane[], laneId: string, actor?: string): Lane[] {
  if (lanes.some((l) => l.id === laneId)) {
    return lanes.slice()
  }
  return [...lanes, { id: laneId, actor: actor && actor.length > 0 ? actor : laneId }]
}

/** Fixed structural phase for a zone id (Understand -> Diverge -> Converge). */
function phaseForZone(zoneId: number): Phase {
  if (zoneId <= 4) {
    return 'Understand'
  }
  if (zoneId === 5) {
    return 'Diverge'
  }
  return 'Converge'
}

/**
 * The identity element of the fold: an empty canvas. Required Process fields
 * start empty and are filled from events; the optional collections start as
 * empty arrays (not undefined) so serialization order is stable from seq 0. The
 * v0.3 assumption ledger (canvas.assumptions) is one such optional collection.
 */
function emptyCanvas(): Canvas {
  return {
    schema_version: '',
    process: { name: '', trigger: '', end_state: '', owner: '', north_star: '' },
    lanes: [],
    nodes: [],
    edges: [],
    zones: [],
    friction: [],
    audit_tags: [],
    opportunities: [],
    assumptions: [],
  }
}
