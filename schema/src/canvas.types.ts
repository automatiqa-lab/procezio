/**
 * DO NOT EDIT BY HAND.
 * Generated from schema/canvas.schema.json by `pnpm --filter @procezio/schema gen`
 * (json-schema-to-typescript). The schema is the contract; these types are
 * downstream of it. CI job ci:schema-drift fails if this file drifts.
 */

/**
 * Event/contract schema version, decoupled from app version. Additive-first evolution (specs/02 section 3).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = string;
/**
 * Stable within-canvas identifier for an ontology element (node/edge/lane/etc). Human-authorable slug, not a uuid - the canvas works on paper.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * The five user-facing shapes (spec v0.2 section 7). Wait and Decision are analytically load-bearing.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "NodeType".
 */
export type NodeType = "Start" | "Step" | "Decision" | "Wait" | "End";
/**
 * Source grade of a quantitative field (spec v0.4 section 3 C2, section 8): gut-feel (narrated from memory) -> verified (checked with a person) -> log-checked (pulled from a system log/report) -> document-backed (a file consented into the Shoebox). Auto-populates the assumption ledger. Additive to the coarse low/med/high on Assumption, which stays for the ledger's own confidence.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ConfidenceTag".
 */
export type ConfidenceTag = "gut-feel" | "verified" | "log-checked" | "document-backed";
/**
 * sequence = normal left-to-right flow; exception-backedge = the one backward rework loop (SDD-2 P2P exception path).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "EdgeKind".
 */
export type EdgeKind = "sequence" | "exception-backedge";
/**
 * The three cognitive phases the 8 zones group into.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Phase".
 */
export type Phase = "Understand" | "Diverge" | "Converge";
/**
 * The 8 Lean wastes (DOWNTIME) used as tappable friction prompts in zone 3.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Downtime".
 */
export type Downtime =
  | "Defects"
  | "Overproduction"
  | "Waiting"
  | "Non-utilized-talent"
  | "Transportation"
  | "Inventory"
  | "Motion"
  | "Extra-processing";
/**
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "DataTag".
 */
export type DataTag = "structured" | "semi-structured" | "unstructured";
/**
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "RulesTag".
 */
export type RulesTag = "explicit" | "mixed" | "judgment";
/**
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ExceptionsTag".
 */
export type ExceptionsTag = "rare" | "occasional" | "frequent";
/**
 * The six opportunity rungs (spec v0.2 section 8). Exactly one per shortlisted opportunity.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "TaxonomyRung".
 */
export type TaxonomyRung = "Remove" | "Standardize" | "Connect" | "Automate" | "Assist" | "Delegate";
/**
 * 2x2 effort-vs-benefit placement (spec v0.2 section 9).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Quadrant".
 */
export type Quadrant = "Quick Win" | "Strategic" | "Fill-in" | "Avoid";
/**
 * Stable within-canvas identifier for an ontology element (node/edge/lane/etc). Human-authorable slug, not a uuid - the canvas works on paper.
 */
export type Id1 = string;
/**
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Uuid".
 */
export type Uuid = string;
/**
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * The concrete event types across the payload families (specs/02 section 4; extended by v0.3 amendment with frame.set and assumption.added).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "EventType".
 */
export type EventType =
  | "session.started"
  | "zone.completed"
  | "node.created"
  | "edge.created"
  | "friction.pinned"
  | "audit_tag.set"
  | "opportunity.created"
  | "score.committed"
  | "challenge.raised"
  | "gate.checked"
  | "case.drafted"
  | "flag.accepted"
  | "rule.fired"
  | "budget.spent"
  | "agent.message"
  | "frame.set"
  | "assumption.added"
  | "commitment"
  | "step.reassigned"
  | "tobe.snapshot.accepted"
  | "shoebox.item.added"
  | "shoebox.item.consented"
  | "extraction.result"
  | "challenge.issued"
  | "challenge.answered"
  | "checkpoint.exported"
  | "persona.defined"
  | "persona.annotated";
/**
 * Discriminated union of the 15 payload families. additionalProperties:false on each member keeps the union disjoint so exactly one matches.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "EventPayload".
 */
export type EventPayload =
  | SessionPayload
  | ZonePayload
  | NodePayload
  | EdgePayload
  | FrictionPayload
  | AuditTagPayload
  | OpportunityPayload
  | ScoreCommittedPayload
  | ChallengePayload
  | GatePayload
  | CasePayload
  | FlagPayload
  | RuleFiredPayload
  | BudgetPayload
  | AgentMessagePayload
  | FramePayload
  | AssumptionAddedPayload
  | CommitmentPayload
  | StepReassignedPayload
  | ToBeSnapshotAcceptedPayload
  | ShoeboxItemAddedPayload
  | ShoeboxItemConsentedPayload
  | ExtractionResultPayload
  | ChallengeIssuedPayload
  | PersonaDefinedPayload
  | PersonaAnnotatedPayload
  | ChallengeAnsweredPayload
  | CheckpointExportedPayload;
/**
 * The presentation-stream event types (spec v0.4 section 3/12, decision KRH5w5KrRemQ). A SEPARATE stream from EventType: geometry lives here, in the same .pnav/.procez file, and is excluded from methodology and provenance projections so it can never change replayed state. The one geometry act with semantic weight - a lane crossing - is NOT here; it is the content event step.reassigned.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "PresentationEventType".
 */
export type PresentationEventType = "node.moved" | "frame.moved" | "frame.resized" | "frame.collapsed";
/**
 * Discriminated union of the presentation-stream payloads. Kept disjoint by additionalProperties:false + distinct required keys, exactly like EventPayload.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "PresentationPayload".
 */
export type PresentationPayload = NodeMovedPayload | FrameMovedPayload | FrameResizedPayload | FrameCollapsedPayload;

/**
 * The single contract for Process Navigator (card C7). Three layers in one artifact: (a) the internal canvas ontology, (b) every event payload family plus the event envelope, (c) LLM structured-output contracts that reuse the ontology shapes. Deterministic control plane, generative language surface: this file is the deterministic part. Ratified artifact - change only via amendment PR + decision record (AGENTS.md / specs/04).
 */
export interface Canvas {
  schema_version: SchemaVersion;
  process: Process;
  lanes: Lane[];
  nodes: Node[];
  edges: Edge[];
  zones: Zone[];
  friction?: Friction[];
  audit_tags?: AuditTag[];
  opportunities?: Opportunity[];
  /**
   * The assumption ledger (v0.3 A2): a first-class object spanning the session. Populated by assumption.added events; prints as the business-case annex.
   */
  assumptions?: Assumption[];
  /**
   * Zone-7 risk-gate results (amendment M2-AMD2). One entry per (opportunity, check), upserted by that composite key from gate.checked events. An opportunity's business case is blocked while any of its five checks is still open. Additive: an item is exactly a GatePayload, so no gate.checked event shape changes.
   */
  gates?: GatePayload[];
  /**
   * Zone-8 business-case drafts (amendment M2-AMD2). One entry per opportunity, upserted by opportunity_id from case.drafted events. Every figure carries a source_ref to its originating zone; every assumption is flagged. Additive: an item is exactly a CasePayload.
   */
  cases?: CasePayload[];
  /**
   * The Shoebox (spec v0.4 section 7): notes and dropped files beside the method. Upserted by item_id from shoebox.item.added; shoebox.item.consented sets consented=true (per-file egress opt-in). Additive and optional.
   */
  shoebox?: ShoeboxItem[];
  /**
   * User-defined stakeholder personas (spec v0.4 section 6, decision hevkGx6MJJAh; Wave 2 B4). A constrained, annotation-only persona the user summons to rehearse a viewpoint. Upserted by id from persona.defined. Their contributions are ALWAYS tagged 'simulated perspective' - rehearsal, not verification. Additive and optional.
   */
  stakeholder_personas?: StakeholderPersona[];
  /**
   * The simulated-perspective annotations personas have contributed (spec v0.4 section 6, Wave 2 B4). Appended from persona.annotated. Rehearsal, never verification: the export gate surfaces any unconfirmed entry as 'confirm with the real stakeholder'. Additive and optional.
   */
  simulated_perspectives?: SimulatedPerspective[];
}
/**
 * Zone 1 (Frame). The north-star metric is the anchor every later score answers to.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Process".
 */
export interface Process {
  name: string;
  /**
   * Pain-first entry (spec v0.4 C3): the pain in the user's own words - what hurts about this process today. The session starts from pain, not from a blank form; the rest of the Frame is derived from it. Optional and additive.
   */
  pain?: string;
  trigger: string;
  end_state: string;
  owner: string;
  frequency?: string;
  volume?: string;
  touch_time?: string;
  north_star: string;
}
/**
 * A swimlane = one actor.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Lane".
 */
export interface Lane {
  id: Id;
  actor: string;
}
/**
 * A typed node in the process map. Multiple inbound edges + waits_on model the parallel join (SDD-2 handoff to C7) without a sixth user-facing shape. v0.4 adds optional per-type detail panels (step_detail/decision_detail/wait_detail/start_detail/end_detail); the panel matching the node's type is the one the UI shows, but the schema stays permissive (all optional, additive) - the type<->panel pairing is a UI/projection concern, not a validation gate.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Node".
 */
export interface Node {
  id: Id;
  type: NodeType;
  lane: Id;
  label: string;
  zone?: number;
  parent?: Id;
  metadata?: NodeMetadata;
  /**
   * Node-level wait-for-dependency: this node cannot proceed until every referenced node exists/completes. Models parallel convergence (the 3-way match waits on both goods-receipt and invoice).
   */
  waits_on?: Id[];
  /**
   * Marks a node whose behaviour changes by mode, season, or exception path (v0.3 A4). Variance is captured in the assumption ledger, not modeled - variant modeling stays out of scope v1.
   */
  varies?: boolean;
  step_detail?: StepDetail;
  decision_detail?: DecisionDetail;
  wait_detail?: WaitDetail;
  start_detail?: StartDetail;
  end_detail?: EndDetail;
}
/**
 * Per-node metadata captured in zone 2 (spec v0.2 section 6, zone 2). All optional - a Start/End node carries little, a Step carries all of it.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "NodeMetadata".
 */
export interface NodeMetadata {
  actor?: string;
  action?: string;
  system?: string;
  input?: string;
  output?: string;
  time?: string;
}
/**
 * Optional zone-2 detail panel for a Step node (spec v0.4 section 3, C1). lane/owner is Node.lane and varies is Node.varies; the rest lives here. Every field optional - absence feeds an Auditor probe, never a blocker.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "StepDetail".
 */
export interface StepDetail {
  systems?: string[];
  touch_time?: TaggedQuantity;
  elapsed_time?: TaggedQuantity;
  frequency?: TaggedQuantity;
  /**
   * Does this step loop back / get redone? (hidden-work probe).
   */
  rework?: boolean;
  batch?: "batch" | "one-by-one";
  standardized?: "standardized" | "improvised";
  /**
   * Free-text pointer or Shoebox item id backing this step's figures (evidence slot).
   */
  evidence?: string;
}
/**
 * A quantitative field with its source grade (spec v0.4 C2). value is free text (a number with units, or a range like '2-5 days') - the methodology works on paper, so no number is invented; confidence carries the source grade into the ledger. Optional everywhere: absence feeds an Auditor probe, never a blocker.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "TaggedQuantity".
 */
export interface TaggedQuantity {
  value: string;
  confidence?: ConfidenceTag;
}
/**
 * Optional zone-2 detail panel for a Decision node (spec v0.4 section 3, C1). Branch shares live on the Decision-outgoing edges (Edge.branch_share), not here; the basis stays on the Decision.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "DecisionDetail".
 */
export interface DecisionDetail {
  question?: string;
  basis?: "written-rule" | "judgment" | "escalation";
  decider?: string;
  /**
   * Link to a Data & rules entry that governs this decision (e.g. 'R2').
   */
  rule_ref?: string;
  /**
   * An explicit decision table (Wave 3 F5): the when->then rules the decision follows, made concrete instead of left in someone's head. Each row is a condition and the outcome it drives.
   */
  decision_table?: {
    when: string;
    then: string;
  }[];
}
/**
 * Optional zone-2 detail panel for a Wait node (spec v0.4 section 3, C1). Wait owns all elapsed/queue time in the model; chasing is the hidden touch time inside a wait.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "WaitDetail".
 */
export interface WaitDetail {
  duration?: TaggedQuantity;
  duration_worst?: TaggedQuantity;
  waiting_on?: "external" | "internal-approval" | "system";
  /**
   * Is someone actively chasing during the wait? (surfaces hidden touch time).
   */
  chasing?: boolean;
  release_trigger?: string;
}
/**
 * Optional detail for a Start node (spec v0.4 section 3): deliberately thin.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "StartDetail".
 */
export interface StartDetail {
  arrival_pattern?: "steady" | "batchy" | "seasonal";
}
/**
 * Optional detail for an End node (spec v0.4 section 3): deliberately thin.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "EndDetail".
 */
export interface EndDetail {
  definition_of_done?: string;
  /**
   * The downstream consumer of this process's output.
   */
  consumer?: string;
}
/**
 * A directed edge, and in v0.4 a first-class handoff object (spec v0.4 section 3, decision t7Fd0ny1kLEB): the clickable thing between two steps carries how the work moves. A node with multiple inbound edges is still a join. medium/trigger/branch_share are optional and additive; a re-key medium between two system-backed steps is what the deterministic HD-2 rule reads to flag a Connect candidate. Transport/queue time is deliberately excluded here - Wait owns time.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Edge".
 */
export interface Edge {
  id: Id;
  from: Id;
  to: Id;
  kind: EdgeKind;
  label?: string;
  /**
   * How the work crosses this handoff (spec v0.4 section 3). re-key between two system-backed steps is the HD-2 Connect-candidate signal.
   */
  medium?: "system" | "mail" | "re-key" | "paper" | "walk-over";
  /**
   * What moves the work across: pushed by the sender, pulled by the receiver, or moved in a batch.
   */
  trigger?: "push" | "pull" | "batch";
  /**
   * Percentage of flow taking this edge - only meaningful on a Decision node's outgoing edges (the basis stays on the Decision). An estimator input; tag its confidence in the ledger.
   */
  branch_share?: number;
}
/**
 * One of the fixed 8 zones. The structure is the pedagogy and cannot be rearranged.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Zone".
 */
export interface Zone {
  id: number;
  phase: Phase;
  name: string;
}
/**
 * Zone 3. Every friction pins to a node (a step or a gap).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Friction".
 */
export interface Friction {
  id: Id;
  waste: Downtime;
  node_id: Id;
  note?: string;
}
/**
 * Zone 4 evidence layer: the data/rules/exceptions profile of a step. This is what later challenges cite.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "AuditTag".
 */
export interface AuditTag {
  id: Id;
  node_id: Id;
  data: DataTag;
  rules: RulesTag;
  exceptions: ExceptionsTag;
}
/**
 * Zones 5/6. Generated in 5 without judgment; triaged and, for the Now pile, scored and given a rung in 6. Rung is relaxed to optional (v0.3 A5): a candidate is triaged before it earns a rung.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Opportunity".
 */
export interface Opportunity {
  id: Id;
  title: string;
  rung?: TaxonomyRung;
  /**
   * Zone-6 triage pile before scoring (v0.3 A5): fast, gut-level, no numbers. Full scoring applies to the Now pile only.
   */
  triage?: "Now" | "Maybe" | "No";
  /**
   * The decision journal (Wave 2 G3): one line on WHY this idea was triaged the way it was. Optional; surfaced in the case annex and one-pager so a Maybe/No is defensible later.
   */
  triage_reason?: string;
  committed?: boolean;
  score?: Score;
  quadrant?: Quadrant;
  depends_on?: Id[];
  /**
   * The map elements this idea acts on (spec v0.4 section 9): node or edge ids the target-state composer transforms under this opportunity's rung. Optional and additive - an idea can exist before it is pinned to specific elements.
   */
  target_refs?: Id[];
}
/**
 * 1-5 rank-only score per axis (spec v0.2 section 9). Never money.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Score".
 */
export interface Score {
  benefit: number;
  effort: number;
}
/**
 * A flagged, sourced assumption in the assumption ledger. No number is ever invented (traceability rule).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Assumption".
 */
export interface Assumption {
  id?: Id1;
  statement: string;
  source: string;
  confidence: "low" | "med" | "high";
  /**
   * Optional two-axis Admiralty grade (Wave 2 D2): source reliability A-F and corroboration 1-6, kept independent (a reliable source can still be uncorroborated). Upgrades the coarse gut-feel/verified confidence without replacing it.
   */
  admiralty?: {
    reliability: "A" | "B" | "C" | "D" | "E" | "F";
    corroboration: "1" | "2" | "3" | "4" | "5" | "6";
  };
  /**
   * Who owns verifying this assumption (v0.3 A2). Optional; the verification checklist surfaces owner alongside the verify_by suggestion.
   */
  owner?: string;
  verify_by?: string;
  /**
   * A reference to concrete proof backing this assumption (Wave 3 D7): a document name, a screenshot filename, an export, a ticket. Text only and kept local - the artifact never leaves the browser. An assumption WITH evidence is evidence-backed; without, it is asserted-only.
   */
  evidence?: string;
}
/**
 * gate.* family - one of the five zone-7 risk checks.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "GatePayload".
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Gate".
 */
export interface GatePayload {
  opportunity_id: Id;
  check:
    "data-privacy" | "regulatory-compliance" | "failure-blast-radius" | "accountability" | "change-impact-on-people";
  status: "open" | "cleared";
  finding?: string;
}
/**
 * case.* family - the zone-8 business case draft. Every figure carries a source ref to its originating zone; every assumption is flagged.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "CasePayload".
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Case".
 */
export interface CasePayload {
  opportunity_id: Id;
  figures: {
    label: string;
    value: string;
    source_ref: Id;
    /**
     * Which side of the case this figure sits on (v0.3 A1): the business case must carry both cost and benefit.
     */
    kind?: "cost" | "benefit";
    /**
     * Mandatory benefit classification (v0.3 A1). capacity-release is explicitly NOT savings until redeployment is named; the template renders the three classes separately.
     */
    benefit_class?: "hard-savings" | "capacity-release" | "quality-speed";
    /**
     * For a capacity-release benefit: who owns redeploying the freed hours. Freed hours are never summed into savings until this is named (v0.3 A1).
     */
    redeployment_owner?: string;
  }[];
  assumptions: Assumption[];
}
/**
 * A projected Shoebox entry (spec v0.4 section 7): a note or a dropped file, and whether its content has been consented to reach the model. Files stay local until consented.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ShoeboxItem".
 */
export interface ShoeboxItem {
  item_id: Id;
  kind: "note" | "file";
  name?: string;
  content_type?: string;
  /**
   * True once the human opted this item's content into the agent context (shoebox.item.consented). Egress-honest: nothing is sent before this.
   */
  consented?: boolean;
}
/**
 * A user-defined stakeholder persona (spec v0.4 section 6, Wave 2 B4). A constrained template - a name, a role, and a one-line perspective the persona argues from - plus the zones it may speak in and the safe triggers that wake it. Hard inherited constraints (enforced by the app, not stored per-persona): annotation-only, muted before the zone-6 commit, evidence-required, max 3 active. The user's perspective text is treated as guarded content the agent voices, never as raw instructions.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "StakeholderPersona".
 */
export interface StakeholderPersona {
  id: Id;
  name: string;
  role: string;
  perspective: string;
  /**
   * The zones (1-8) this persona may annotate. Absent = the converge zones (6-8) where a stakeholder view matters most.
   */
  zones?: number[];
  /**
   * The safe-menu triggers that wake the persona. No free-form triggers.
   */
  triggers?: ("on-commit" | "on-risk-gate" | "on-mention")[];
}
/**
 * One simulated-perspective annotation in the ledger (spec v0.4 section 6, Wave 2 B4). id is the annotation's own id so it can be confirmed later. Always rehearsal until confirmed with the real stakeholder.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "SimulatedPerspective".
 */
export interface SimulatedPerspective {
  id: Id;
  persona_id: Id;
  text: string;
  anchor_ref?: Id;
  cited_refs?: Id[];
  /**
   * True once a human confirms this view with the real stakeholder. Until then the export gate flags it.
   */
  confirmed?: boolean;
}
/**
 * Two-ink rule (constitution p5). Agent-authored content is born pencil until a human accepts it.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Provenance".
 */
export interface Provenance {
  state: "ink" | "pencil";
  accepted_by?: string | null;
  accepted_at?: Timestamp | null;
}
/**
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Author".
 */
export interface Author {
  kind: "human" | "agent";
  id: string;
  model_ref?: string;
}
/**
 * The immutable, attributed log record (specs/02 section 4). Truth is an event log; audit is the storage model, not a feature.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "EventEnvelope".
 */
export interface EventEnvelope {
  event_id: Uuid;
  session_id: Uuid;
  seq: number;
  type: EventType;
  author: Author;
  provenance: Provenance;
  payload: EventPayload;
  causation_id?: string | null;
  correlation_id: Uuid;
  compensates?: Uuid | null;
  schema_version: SchemaVersion;
  ts: Timestamp;
}
/**
 * session.* family. Pins the determinism inputs (ruleset hash, prompt-pack version, model ref).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "SessionPayload".
 */
export interface SessionPayload {
  process_name: string;
  ruleset_hash: string;
  prompt_pack_version: string;
  model_ref?: string;
}
/**
 * zone.* family.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ZonePayload".
 */
export interface ZonePayload {
  zone_id: number;
  phase?: Phase;
}
/**
 * node.* family - the created/updated node. The optional 'actor' carries the human-readable swimlane label for the node's lane, independent of the lane id slug: the creating event sets the actor once, and projection folds it onto the derived Lane instead of defaulting the actor to the id. Additive lane-actor mechanism (no new event type needed - node.created already fabricates the lane).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "NodePayload".
 */
export interface NodePayload {
  node: Node;
  /**
   * Human-readable actor label for node.lane, set independently of the id slug. Optional; projection falls back to the lane id when absent.
   */
  actor?: string;
}
/**
 * edge.* family.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "EdgePayload".
 */
export interface EdgePayload {
  edge: Edge;
}
/**
 * friction.* family.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "FrictionPayload".
 */
export interface FrictionPayload {
  friction: Friction;
}
/**
 * audit_tag.* family.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "AuditTagPayload".
 */
export interface AuditTagPayload {
  audit_tag: AuditTag;
}
/**
 * opportunity.* family (create/update in zones 5/6, pre-commit).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "OpportunityPayload".
 */
export interface OpportunityPayload {
  opportunity: Opportunity;
}
/**
 * score.committed - the anti-anchoring trigger. Zone-6 agent rules fire only on this event, never pre-commit.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ScoreCommittedPayload".
 */
export interface ScoreCommittedPayload {
  opportunity_id: Id;
  score: Score;
}
/**
 * challenge.* family. At most one per commit, citing specific canvas evidence.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ChallengePayload".
 */
export interface ChallengePayload {
  opportunity_id: Id;
  dimension: "benefit" | "effort";
  message: string;
  evidence_refs: Id[];
}
/**
 * flag.* family - accept/reject of a pencil (agent) contribution; transitions provenance.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "FlagPayload".
 */
export interface FlagPayload {
  target_event_id: Uuid;
  decision: "accepted" | "rejected";
}
/**
 * rule.fired - every rule firing is audited. This is how agent behavior stays replayable.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "RuleFiredPayload".
 */
export interface RuleFiredPayload {
  rule_id: string;
  severity: "info" | "nudge" | "challenge" | "block";
  budget_class?: string;
  matched_on?: string;
}
/**
 * budget.* family - the interjection ledger. Visible pips are a projection of these events.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "BudgetPayload".
 */
export interface BudgetPayload {
  zone_id: number;
  spent: number;
  window: string;
}
/**
 * agent.message - a chat-sidebar or in-canvas annotation from the agent. Born pencil.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "AgentMessagePayload".
 */
export interface AgentMessagePayload {
  text: string;
  anchor_ref?: Id;
}
/**
 * frame.set family (v0.3). A partial patch of the zone-1 Frame: every field is optional, mirroring Process, so a frame.set carries only the fields being set and projection merges them onto canvas.process, leaving unmentioned fields untouched. Absent fields are never blanked. minProperties 1 keeps every field optional while forbidding the degenerate empty patch, so an empty payload {} still matches no family in the EventPayload oneOf.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "FramePayload".
 */
export interface FramePayload {
  name?: string;
  pain?: string;
  trigger?: string;
  end_state?: string;
  owner?: string;
  frequency?: string;
  volume?: string;
  touch_time?: string;
  north_star?: string;
}
/**
 * assumption.added family (v0.3 A2). Appends one entry to the session-spanning assumption ledger (canvas.assumptions). Entries are created when a quantity is flagged gut-feel, a node is marked varies, the agent guesses a pencil value, or a cost estimate is entered.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "AssumptionAddedPayload".
 */
export interface AssumptionAddedPayload {
  assumption: Assumption;
}
/**
 * commitment - the signing ceremony (spec v0.4 section 5, decision D1). A deliberate sign+confirm that seals the committed scores and is the ONLY trigger that wakes the Challenger. Anti-anchoring made tangible: the Challenger literally cannot speak before a commitment event exists. score.committed still carries each score; commitment is the irreversible seal over one or more of them.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "CommitmentPayload".
 */
export interface CommitmentPayload {
  /**
   * @minItems 1
   */
  opportunity_ids: [Id, ...Id[]];
  signed_by?: string;
  statement?: string;
}
/**
 * step.reassigned - the single content event a geometry drag may emit (spec v0.4 section 3, decision KRH5w5KrRemQ). A vertical drag across a lane boundary is a semantic act (the step now belongs to a different owner), confirmed by the user; every other drag is a presentation event. This is the sole presentation->content crossover.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "StepReassignedPayload".
 */
export interface StepReassignedPayload {
  node_id: Id;
  from_lane?: Id;
  to_lane: Id;
}
/**
 * tobe.snapshot.accepted - the human accepts a target-state composer snapshot into the improvement case as the to-be annex (spec v0.4 section 9, decision R1H3kHjIEvLc). The composer is deterministic (rung transforms); the snapshot records which elements changed under which rung and the estimator delta, always framed 'hypothesis, not a promise'. name/narrative are the optional human-facing labelling the model may add (ComposerNamingOutput) - never the numbers or the structure.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ToBeSnapshotAcceptedPayload".
 */
export interface ToBeSnapshotAcceptedPayload {
  opportunity_id: Id;
  changes: {
    element_ref: Id;
    rung: TaxonomyRung;
    note?: string;
  }[];
  delta?: EstimatorDelta;
  name?: string;
  narrative?: string;
}
/**
 * Deterministic what-if delta between two process states (spec v0.4 section 10 F1). Free-text values so no number is invented; every value is 'an estimate from your inputs, not a measurement' and its confidence lives in the ledger.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "EstimatorDelta".
 */
export interface EstimatorDelta {
  cycle_time?: string;
  touch_time?: string;
  handoff_count?: number;
  biggest_wait?: string;
}
/**
 * shoebox.item.added - a note or dropped file enters the Shoebox (spec v0.4 section 7). Files stay local; content reaches the LLM only after a separate shoebox.item.consented (per-file opt-in).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ShoeboxItemAddedPayload".
 */
export interface ShoeboxItemAddedPayload {
  item_id: Id;
  kind: "note" | "file";
  name?: string;
  content_type?: string;
}
/**
 * shoebox.item.consented - the per-file opt-in that lets a Shoebox item's content reach the configured model (spec v0.4 section 7). Egress-honest: nothing is sent until this exists.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ShoeboxItemConsentedPayload".
 */
export interface ShoeboxItemConsentedPayload {
  item_id: Id;
}
/**
 * extraction.result - the Auditor's schema-validated extraction from a consented Shoebox item (spec v0.4 section 7). Produces pencil chips linked to their source item ('your note mentions a month-end reconciliation - not on the map -> add?'). Never feeds ideation or scoring.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ExtractionResultPayload".
 */
export interface ExtractionResultPayload {
  source_item_id: Id;
  chips: ExtractionChip[];
}
/**
 * One candidate surfaced by the Auditor from a consented Shoebox item (spec v0.4 section 7). Lands as pencil, linked to its source; the human accepts or rejects. Never feeds ideation or scoring.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ExtractionChip".
 */
export interface ExtractionChip {
  text: string;
  /**
   * What the chip proposes, e.g. 'add a month-end reconciliation step'.
   */
  suggests?: string;
}
/**
 * challenge.issued - a graded Challenger interjection (spec v0.4 section 5, decision B3). tier is the escalation rung (probe -> alert -> challenge); cited_refs are the canvas element ids the challenge stands on (rendered as the evidence line). Emitted only after a commitment event exists.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ChallengeIssuedPayload".
 */
export interface ChallengeIssuedPayload {
  opportunity_id: Id;
  tier: "probe" | "alert" | "challenge";
  dimension?: "benefit" | "effort";
  message: string;
  /**
   * @minItems 1
   */
  cited_refs: [Id, ...Id[]];
}
/**
 * persona.defined - the user creates or edits a stakeholder persona (human ink). Upserted by persona.id into canvas.stakeholder_personas.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "PersonaDefinedPayload".
 */
export interface PersonaDefinedPayload {
  persona: StakeholderPersona;
}
/**
 * persona.annotated - a simulated-perspective annotation from a stakeholder persona (agent-authored, born pencil). ALWAYS a rehearsal, never verification: the export gate nudges 'confirm with the real stakeholder'. cited_refs bind it to canvas evidence, like a challenge. Appended (by id) to canvas.simulated_perspectives; re-emitting the same id with confirmed=true is how a human confirms it with the real stakeholder.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "PersonaAnnotatedPayload".
 */
export interface PersonaAnnotatedPayload {
  id: Id;
  persona_id: Id;
  text: string;
  anchor_ref?: Id;
  cited_refs?: Id[];
  confirmed?: boolean;
}
/**
 * challenge.answered - the human's response to a challenge (spec v0.4 section 5): keep the score, revise it, or acknowledge. Closes the challenge-verify-respond grammar; the human always decides.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ChallengeAnsweredPayload".
 */
export interface ChallengeAnsweredPayload {
  opportunity_id: Id;
  response: "kept" | "revised" | "acknowledged";
  note?: string;
}
/**
 * checkpoint.exported - a phase-boundary checkpoint artifact was exported (spec v0.4 section 4/11), e.g. the friction-map snapshot after Understand. Delivers value before completion.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "CheckpointExportedPayload".
 */
export interface CheckpointExportedPayload {
  checkpoint: "understand" | "diverge" | "converge" | "friction-map" | "one-pager";
  format?: "png" | "pdf" | "slide";
}
/**
 * A world-coordinate point on the infinite canvas (spec v0.4 section 2). Presentation only - never read by the methodology projection.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Position".
 */
export interface Position {
  x: number;
  y: number;
}
/**
 * A frame's width/height in world units (spec v0.4 section 3, frame growth discipline).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "Size".
 */
export interface Size {
  w: number;
  h: number;
}
/**
 * node.moved - a node dragged to a new world position (presentation only). Position is presentation; sequence is edges. A vertical drag across a lane boundary additionally emits the content event step.reassigned.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "NodeMovedPayload".
 */
export interface NodeMovedPayload {
  node_id: Id;
  position: Position;
}
/**
 * frame.moved - a methodology widget frame dragged on the canvas (presentation only). A user-moved frame is never auto-relocated by the soft-nudge composer.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "FrameMovedPayload".
 */
export interface FrameMovedPayload {
  frame_id: Id;
  position: Position;
}
/**
 * frame.resized - a frame manually resized (presentation only).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "FrameResizedPayload".
 */
export interface FrameResizedPayload {
  frame_id: Id;
  size: Size;
}
/**
 * frame.collapsed - a frame collapsed or expanded (presentation only).
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "FrameCollapsedPayload".
 */
export interface FrameCollapsedPayload {
  frame_id: Id;
  collapsed: boolean;
}
/**
 * The presentation-stream log record (spec v0.4 section 3/12). Lighter than EventEnvelope: no provenance (geometry has no ink/pencil), no causation/compensation. Its own seq counter within the presentation stream. author is optional (Solo has no need; Collab attributes cursor/geometry moves). Persisted in the same session file but replayed into a SEPARATE PresentationState, never the methodology Canvas.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "PresentationEnvelope".
 */
export interface PresentationEnvelope {
  event_id: Uuid;
  session_id: Uuid;
  seq: number;
  type: PresentationEventType;
  payload: PresentationPayload;
  author?: Author;
  ts: Timestamp;
}
/**
 * The projected geometry (spec v0.4 section 2/3): last-write-wins node positions and frame geometry, folded from the presentation stream. A disposable view - losing it never loses methodology truth. Frames absent here sit in the default A3 composition.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "PresentationState".
 */
export interface PresentationState {
  nodes?: {
    node_id: Id;
    position: Position;
  }[];
  frames?: {
    frame_id: Id;
    position?: Position;
    size?: Size;
    collapsed?: boolean;
  }[];
}
/**
 * LLM contract: seed a skeleton map from a described process (spec v0.2 zone-2 agent duty). SAME shapes as the ontology - the model fills validated nodes/edges/lanes, it does not invent a format.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "SeedMapOutput".
 */
export interface SeedMapOutput {
  lanes: Lane[];
  nodes: Node[];
  edges: Edge[];
}
/**
 * LLM contract: word a nudge/challenge the rules already decided to fire (T1). The rule decides WHETHER; the model only decides HOW to say it.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "WordNudgeOutput".
 */
export interface WordNudgeOutput {
  text: string;
}
/**
 * challenge.* family. At most one per commit, citing specific canvas evidence.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ChallengeOutput".
 */
export interface ChallengePayload1 {
  opportunity_id: Id;
  dimension: "benefit" | "effort";
  message: string;
  evidence_refs: Id[];
}
/**
 * case.* family - the zone-8 business case draft. Every figure carries a source ref to its originating zone; every assumption is flagged.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "DraftCaseOutput".
 */
export interface CasePayload1 {
  opportunity_id: Id;
  figures: {
    label: string;
    value: string;
    source_ref: Id;
    /**
     * Which side of the case this figure sits on (v0.3 A1): the business case must carry both cost and benefit.
     */
    kind?: "cost" | "benefit";
    /**
     * Mandatory benefit classification (v0.3 A1). capacity-release is explicitly NOT savings until redeployment is named; the template renders the three classes separately.
     */
    benefit_class?: "hard-savings" | "capacity-release" | "quality-speed";
    /**
     * For a capacity-release benefit: who owns redeploying the freed hours. Freed hours are never summed into savings until this is named (v0.3 A1).
     */
    redeployment_owner?: string;
  }[];
  assumptions: Assumption[];
}
/**
 * LLM contract: surface candidate chips from a consented Shoebox item (spec v0.4 section 7). The model only proposes chips; the caller attaches the source_item_id and the chips land as pencil. The model never writes to the map or the ledger directly.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ExtractionOutput".
 */
export interface ExtractionOutput {
  chips: ExtractionChip[];
}
/**
 * LLM contract: name and narrate a target-state composer snapshot (spec v0.4 section 9). The composer transforms and the estimator delta are deterministic; the model writes only the human-facing name and narrative, never the numbers or the structure.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ComposerNamingOutput".
 */
export interface ComposerNamingOutput {
  name: string;
  narrative: string;
}
/**
 * LLM contract: word a graded challenge the rules already decided to fire (spec v0.4 section 5). The rule sets the tier and the opportunity; the model writes the message and lists the canvas element ids it cites (>=1, the evidence line). The model never decides whether to challenge.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "ChallengeIssuedOutput".
 */
export interface ChallengeIssuedOutput {
  message: string;
  /**
   * @minItems 1
   */
  cited_refs: [Id, ...Id[]];
}
/**
 * LLM contract: voice a stakeholder persona's simulated-perspective annotation (spec v0.4 section 6, Wave 2 B4). The app decides WHEN the persona speaks and hands over its role + perspective as guarded content; the model writes one short annotation FROM that viewpoint and lists any canvas element ids it leans on. It never invents data, never speaks for the real person, and is always tagged 'simulated perspective' downstream.
 *
 * This interface was referenced by `Canvas`'s JSON-Schema
 * via the `definition` "PersonaAnnotationOutput".
 */
export interface PersonaAnnotationOutput {
  text: string;
  cited_refs?: Id[];
}
