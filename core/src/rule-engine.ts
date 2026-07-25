// C12 - the declarative rule engine for @procezio/core.
//
// This is the deterministic CONTROL PLANE of the agent (constitution p10, the
// layering principle in AGENTS.md): versioned rules decide WHETHER the
// agent reacts; the LLM only later decides HOW to word it. So this module is
// pure, declarative, and generative-free: given a ruleset, the current canvas
// projection, and the event that just committed, it returns the rules that fired
// as `rule.fired` EventCandidates. It never calls a model, never touches the
// network, never evaluates a string as code, and never reads a clock or RNG.
//
// Scope boundary (card C12): this engine only MATCHES rules and mints candidates.
// It does NOT enforce budget or cooldown (C14 owns that - the fields are read and
// carried through, never acted on here) and it does NOT render message_template
// into human text (a later LLM-wording task - the template is stored verbatim).
//
// Isomorphic by construction: no `node:*` import, no filesystem, no clock. The
// only dependency is ajv (a production dependency of @procezio/core that already
// ships in the browser Solo bundle), used to validate a ruleset against the
// co-located JSON Schema. Identical behavior in the browser and in the Node relay.
//
// Anti-anchoring (spec v0.2 s.9, s.10): a rule whose `when` is
// {event_type:'score.committed'} fires ONLY on a score.committed triggering
// event - never pre-commit, never on any other event type. That is a direct
// consequence of the leaf matcher below (`event.type === cond.event_type`) and is
// the named acceptance test for this card.

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import type { ValidateFunction } from 'ajv'
// Ontology types come from the ratified schema (C7), never redefined here, so the
// engine's event-carrying shapes cannot drift from the contract the event store
// (C8) validates against. RuleFiredPayload is imported so `severity` and the
// payload we mint are the SAME type the schema defines - not a parallel copy.
import type {
  Author,
  Canvas,
  EventEnvelope,
  EventType,
  RuleFiredPayload,
  SchemaVersion,
  Uuid,
} from '@procezio/schema'

// --- The declarative `when` language (structured predicate tree) --------------
//
// Conditions are DATA, not code. There is no eval/Function anywhere; a `when` is a
// small tree of predicates and logical operators that the matcher below walks. A
// hand-authored ruleset (YAML) parses into exactly these shapes.

/** The eight safe comparison operators a path predicate may use. */
export type PathOp = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'in'

/**
 * Leaf predicate matching the type of the event that triggered evaluation. This
 * is the anti-anchoring primitive: {event_type:'score.committed'} is true only
 * when the triggering event is a score.committed.
 */
export interface EventTypePredicate {
  event_type: EventType
}

/**
 * Leaf predicate over the canvas projection via a safe dotted path (e.g.
 * `process.north_star`, `opportunities.0.score.benefit`). `value` is unused for
 * the `exists` op. Path lookup is prototype-pollution safe (see getPath).
 */
export interface PathPredicate {
  path: string
  op: PathOp
  value?: unknown
}

/** A leaf predicate: either an event-type match or a projection path check. */
export type Predicate = EventTypePredicate | PathPredicate

/**
 * Logical composition of conditions. `all` = AND, `any` = OR, `not` = negation.
 * Recursively nests WhenConditions, so arbitrarily deep boolean trees are
 * expressible with no code execution.
 */
export type LogicalOp = { all: WhenCondition[] } | { any: WhenCondition[] } | { not: WhenCondition }

/**
 * The seven canvas collections a quantifier may range over. These are exactly the
 * array-valued keys of the ratified Canvas ontology (schema/src/canvas.types.ts) -
 * no new "collection" concept is invented, the names ARE the Canvas keys. Any name
 * outside this closed set is rejected at validation time (RULESET_JSON_SCHEMA enum),
 * so the engine never sees an unknown collection at runtime.
 */
export type CollectionName =
  'nodes' | 'edges' | 'lanes' | 'zones' | 'friction' | 'audit_tags' | 'opportunities'

/**
 * Existential quantifier over a canvas collection: true iff AT LEAST ONE element of
 * `Canvas[in]` satisfies `where`. Inside `where`, a {path:...} predicate reads from
 * the CURRENT element (not the whole canvas), an {event_type:...} predicate still
 * refers to the triggering event, and logical/quantifier nesting composes normally.
 * Vacuously FALSE for an empty (or absent) collection.
 */
export interface ExistsPredicate {
  exists: { in: CollectionName; where: WhenCondition }
}

/**
 * Universal quantifier over a canvas collection: true iff EVERY element of
 * `Canvas[in]` satisfies `where`. Same `where` scoping rules as ExistsPredicate.
 * Vacuously TRUE for an empty (or absent) collection.
 */
export interface EveryPredicate {
  every: { in: CollectionName; where: WhenCondition }
}

/**
 * A full `when` condition: a leaf predicate, a logical composition, or a collection
 * quantifier. The quantifier members are additive - `all`/`any`/`not` nest around
 * them for free, and their `where` clause is itself a WhenCondition.
 */
export type WhenCondition = Predicate | LogicalOp | ExistsPredicate | EveryPredicate

/**
 * One rule. `when` decides whether it fires; `severity` classifies the reaction.
 * `min_tier`/`budget_class`/`cooldown` are carried for later stages (C14 budget/
 * cooldown enforcement) - this engine reads but never acts on them.
 * `message_template` is stored VERBATIM; rendering it into human text is a later
 * LLM-wording task, not this module's job.
 */
export interface Rule {
  id: string
  when: WhenCondition
  severity: RuleFiredPayload['severity']
  min_tier?: string
  budget_class?: string
  cooldown?: string
  message_template?: string
}

/** A versioned collection of rules, evaluated in array order. */
export interface Ruleset {
  version: string
  rules: Rule[]
}

/**
 * A `rule.fired` event candidate: a full EventEnvelope MINUS the seq (the event
 * store is the sole authority on seq, exactly as for any other candidate - see
 * event-store.ts EventCandidate). Locally derived from EventEnvelope rather than
 * imported from the store so C12 stays decoupled from C8; its payload is narrowed
 * to RuleFiredPayload because a fired rule always carries that family.
 */
export type RuleFiredEventCandidate = Omit<EventEnvelope, 'seq' | 'payload'> & {
  payload: RuleFiredPayload
}

/**
 * The envelope fields the engine cannot deterministically invent, injected by the
 * caller (the orchestration loop / event store, a later card). Keeping identity
 * (event_id) and the clock (ts) OUT of evaluate() is what makes the engine pure:
 * no uuid generation, no Date.now, so replaying the same inputs yields byte-
 * identical output. `eventId(rule, index)` lets the caller mint a deterministic id
 * per fired rule without the engine touching an RNG.
 */
export interface EvaluateContext {
  /** Session the triggering event belongs to; copied onto every candidate. */
  sessionId: Uuid
  /** Correlation id threading this agent reaction; copied onto every candidate. */
  correlationId: Uuid
  /** Contract version to stamp (session-pinned upstream for replay determinism). */
  schemaVersion: SchemaVersion
  /** Identity of the agent that authors these rule.fired events. */
  agentId: string
  /** Optional model ref for the authoring agent. */
  modelRef?: string
  /** Caller-supplied, deterministic event id for the Nth fired rule. */
  eventId: (rule: Rule, index: number) => Uuid
  /** Caller-supplied timestamp for this evaluation tick (the engine has no clock). */
  ts: string
}

// --- Safe path lookup ---------------------------------------------------------

// Segment names that could reach the prototype chain / constructor are refused
// outright, so a hand-authored path can never walk into Object/Array internals
// (prototype-pollution / getter-injection defense). This is a hard denylist, not
// a sanitize-and-continue.
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

/**
 * Resolve a dotted path against a scope root using ONLY own enumerable-or-not
 * properties (Object.prototype.hasOwnProperty), never inherited ones, and never
 * crossing a forbidden segment. Returns undefined for any miss - there is no
 * throw, so a bad path is silently "no match", keeping evaluate() total.
 *
 * The root is typed `unknown` because the scope is the whole Canvas at the top
 * level but a single collection ELEMENT inside a quantifier's `where` clause - the
 * same prototype-pollution defense applies uniformly to both.
 */
function getPath(root: unknown, dotted: string): unknown {
  let cur: unknown = root
  for (const segment of dotted.split('.')) {
    if (FORBIDDEN_SEGMENTS.has(segment)) return undefined
    if (cur === null || typeof cur !== 'object') return undefined
    if (!Object.prototype.hasOwnProperty.call(cur, segment)) return undefined
    cur = (cur as Record<string, unknown>)[segment]
  }
  return cur
}

/**
 * Read a canvas collection as an array. Collections ALWAYS live at the canvas root
 * (never on an arbitrary element), so a quantifier's `in` lookup threads the canvas
 * root, not the current scope. Optional collections (friction/audit_tags/
 * opportunities) and any non-array value default to [] - which is what gives `every`
 * its vacuous-truth and `exists` its vacuous-falsity on an empty/absent collection.
 * The `in` name is a validated CollectionName (schema enum), never a dotted path, so
 * no prototype-chain guard is needed here.
 */
function getCollection(canvas: Canvas, name: CollectionName): unknown[] {
  // `name` is a CollectionName, which is precisely the set of array-valued Canvas
  // keys, so this indexes Canvas directly - no cast to an index signature (Canvas
  // has none, hence the prior `as Record<string, unknown>` was a rejected overlap).
  const value = canvas[name]
  return Array.isArray(value) ? value : []
}

/**
 * Total, side-effect-free comparison. Returns -1/0/1 for two numbers or two
 * strings; NaN for anything incomparable (mismatched or non-orderable types). All
 * ordering ops below treat NaN as "false", so an ill-typed comparison never fires.
 */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  return Number.NaN
}

function matchPath(pred: PathPredicate, scope: unknown): boolean {
  const actual = getPath(scope, pred.path)
  switch (pred.op) {
    case 'exists':
      return actual !== undefined
    case 'eq':
      return actual === pred.value
    case 'neq':
      return actual !== pred.value
    case 'gt':
      return compare(actual, pred.value) > 0
    case 'lt':
      return compare(actual, pred.value) < 0
    case 'gte':
      return compare(actual, pred.value) >= 0
    case 'lte':
      return compare(actual, pred.value) <= 0
    case 'in':
      return Array.isArray(pred.value) && pred.value.some((v) => v === actual)
    default:
      // Unreachable: PathOp is a closed union. A structurally-invalid op is
      // rejected upstream by createRuleValidator; if one slips through it matches
      // nothing rather than throwing, keeping the engine total.
      return false
  }
}

/**
 * Recursively evaluate a `when` condition. Two roots are threaded, deliberately
 * distinct (see the module's quantifier design):
 *
 *   - `canvasRoot` is ALWAYS the top-level Canvas. A quantifier's `in` collection
 *     lookup reads from here regardless of nesting depth, because collections live
 *     at the canvas root, never on an element. So an `exists` inside another
 *     quantifier's `where` re-roots its own collection lookup to the canvas.
 *   - `scope` is what a {path:...} predicate resolves against. It is the Canvas at
 *     the top level and is RE-BOUND to the current collection element when
 *     descending into a `where` clause - "inside where, {path:...} reads from the
 *     current element".
 *
 * The triggering `event` never changes with scope: {event_type:...} inside a
 * `where` still refers to the event that triggered evaluation. Logical operators
 * and quantifiers are checked before the leaf shapes (their keys are disjoint from
 * the leaf keys). Pure: reads only the triggering event and the projection, no
 * I/O, no clock, no eval - the quantifier is structured data-branching.
 */
function matchesWhere(
  cond: WhenCondition,
  event: EventEnvelope,
  canvasRoot: Canvas,
  scope: unknown,
): boolean {
  if ('all' in cond) return cond.all.every((c) => matchesWhere(c, event, canvasRoot, scope))
  if ('any' in cond) return cond.any.some((c) => matchesWhere(c, event, canvasRoot, scope))
  if ('not' in cond) return !matchesWhere(cond.not, event, canvasRoot, scope)
  if ('exists' in cond) {
    const { in: name, where } = cond.exists
    return getCollection(canvasRoot, name).some((el) => matchesWhere(where, event, canvasRoot, el))
  }
  if ('every' in cond) {
    const { in: name, where } = cond.every
    return getCollection(canvasRoot, name).every((el) => matchesWhere(where, event, canvasRoot, el))
  }
  if ('event_type' in cond) return event.type === cond.event_type
  return matchPath(cond, scope)
}

/**
 * Evaluate a `when` against the triggering event and the projection. Thin wrapper
 * that seeds both roots to the whole Canvas: at the top level, {path:...} reads the
 * canvas (unchanged from before quantifiers existed).
 */
function matches(cond: WhenCondition, event: EventEnvelope, projection: Canvas): boolean {
  return matchesWhere(cond, event, projection, projection)
}

// --- evaluate -----------------------------------------------------------------

/**
 * Match a ruleset against the triggering event + current projection and return
 * one `rule.fired` candidate per matched rule, IN RULESET ORDER.
 *
 * Deterministic by construction: no Date.now, no Math.random, no mutation of the
 * inputs. Identity (event_id) and time (ts) are supplied by `context`, never
 * fabricated here, so the same (ruleset, projection, event, context) inputs
 * always yield deep-equal output. Every candidate is agent-authored and born
 * pencil (constitution p5, two-ink rule) - the event store re-derives the pencil
 * state from author.kind on append, so this is consistent, not authoritative.
 *
 * This function only DECIDES WHICH rules fired. It does not enforce budget or
 * cooldown (C14) and does not render message_template - those are deferred by the
 * card contract.
 */
export function evaluate(
  ruleset: Ruleset,
  projection: Canvas,
  triggeringEvent: EventEnvelope,
  context: EvaluateContext,
): RuleFiredEventCandidate[] {
  const fired: RuleFiredEventCandidate[] = []

  ruleset.rules.forEach((rule, index) => {
    if (!matches(rule.when, triggeringEvent, projection)) return

    // rule.fired payload: the SAME shape the schema ratifies. budget_class is
    // carried through when present (C14 reads it later); matched_on records the
    // event type that triggered the firing, for audit/replay.
    const payload: RuleFiredPayload = {
      rule_id: rule.id,
      severity: rule.severity,
      matched_on: triggeringEvent.type,
      ...(rule.budget_class !== undefined ? { budget_class: rule.budget_class } : {}),
    }

    const author: Author = {
      kind: 'agent',
      id: context.agentId,
      ...(context.modelRef !== undefined ? { model_ref: context.modelRef } : {}),
    }

    fired.push({
      event_id: context.eventId(rule, index),
      session_id: context.sessionId,
      type: 'rule.fired',
      author,
      // Born pencil: agent-authored contribution awaiting human accept. The store
      // is the authority on this on append; we set it consistently, not decisively.
      provenance: { state: 'pencil', accepted_by: null, accepted_at: null },
      payload,
      // The triggering event caused this reaction (deterministic, from input).
      causation_id: triggeringEvent.event_id,
      correlation_id: context.correlationId,
      compensates: null,
      schema_version: context.schemaVersion,
      ts: context.ts,
    })
  })

  return fired
}

// --- Ruleset validation (JSON Schema, ajv-2020) -------------------------------

/**
 * ajv-2020 JSON Schema for a Ruleset. Mirrors the TypeScript interfaces above so
 * a YAML-authored ruleset can be validated at load time. `event_type` is a plain
 * string here (not an enum) deliberately: coupling it to the ratified EventType
 * enum would silently reject a valid new event type the day the ontology grows,
 * with no gate to catch the staleness. A typo'd event_type simply never matches
 * at runtime, which is the safe failure mode.
 */
export const RULESET_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://procez.io/schema/ruleset.schema.json',
  title: 'Ruleset',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'rules'],
  properties: {
    version: { type: 'string' },
    rules: { type: 'array', items: { $ref: '#/$defs/Rule' } },
  },
  $defs: {
    Rule: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'when', 'severity'],
      properties: {
        id: { type: 'string', minLength: 1 },
        when: { $ref: '#/$defs/WhenCondition' },
        severity: { type: 'string', enum: ['info', 'nudge', 'challenge', 'block'] },
        min_tier: { type: 'string' },
        budget_class: { type: 'string' },
        cooldown: { type: 'string' },
        message_template: { type: 'string' },
      },
    },
    WhenCondition: {
      oneOf: [
        { $ref: '#/$defs/EventTypePredicate' },
        { $ref: '#/$defs/PathPredicate' },
        { $ref: '#/$defs/AllOp' },
        { $ref: '#/$defs/AnyOp' },
        { $ref: '#/$defs/NotOp' },
        { $ref: '#/$defs/ExistsOp' },
        { $ref: '#/$defs/EveryOp' },
      ],
    },
    CollectionName: {
      type: 'string',
      enum: ['nodes', 'edges', 'lanes', 'zones', 'friction', 'audit_tags', 'opportunities'],
    },
    ExistsOp: {
      type: 'object',
      additionalProperties: false,
      required: ['exists'],
      properties: {
        exists: {
          type: 'object',
          additionalProperties: false,
          required: ['in', 'where'],
          properties: {
            in: { $ref: '#/$defs/CollectionName' },
            where: { $ref: '#/$defs/WhenCondition' },
          },
        },
      },
    },
    EveryOp: {
      type: 'object',
      additionalProperties: false,
      required: ['every'],
      properties: {
        every: {
          type: 'object',
          additionalProperties: false,
          required: ['in', 'where'],
          properties: {
            in: { $ref: '#/$defs/CollectionName' },
            where: { $ref: '#/$defs/WhenCondition' },
          },
        },
      },
    },
    EventTypePredicate: {
      type: 'object',
      additionalProperties: false,
      required: ['event_type'],
      properties: {
        event_type: { type: 'string' },
      },
    },
    PathPredicate: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'op'],
      properties: {
        path: { type: 'string', minLength: 1 },
        op: { type: 'string', enum: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'exists', 'in'] },
        value: {},
      },
    },
    AllOp: {
      type: 'object',
      additionalProperties: false,
      required: ['all'],
      properties: { all: { type: 'array', items: { $ref: '#/$defs/WhenCondition' } } },
    },
    AnyOp: {
      type: 'object',
      additionalProperties: false,
      required: ['any'],
      properties: { any: { type: 'array', items: { $ref: '#/$defs/WhenCondition' } } },
    },
    NotOp: {
      type: 'object',
      additionalProperties: false,
      required: ['not'],
      properties: { not: { $ref: '#/$defs/WhenCondition' } },
    },
  },
} as const

/**
 * Build an ajv validator for a Ruleset, using the SAME ajv-2020 + formats setup
 * the event store uses so validation is consistent across the core. Pass your own
 * Ajv2020 instance to share a compilation cache; otherwise a fresh strict instance
 * is created. The returned function is an ajv type guard: on false, `.errors`
 * carries the schema violations.
 */
export function createRuleValidator(ajv?: Ajv2020): ValidateFunction<Ruleset> {
  const instance = ajv ?? createStrictAjv()
  return instance.compile<Ruleset>(RULESET_JSON_SCHEMA)
}

function createStrictAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  return ajv
}
