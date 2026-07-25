// M2-02 - the fixed 8-zone / 3-phase canvas structure, as static display data.
//
// The structure is the pedagogy and cannot be rearranged (spec v0.2 section 6:
// "Fixed, pre-defined layout ... cannot be rearranged. Phase grouping is visible
// in navigation"). This module is the single source of that structure for the app
// shell's navigation rail and panel titles.
//
// The `Phase` union is IMPORTED from the ratified schema (@procezio/schema), not
// redefined here - the schema's canvas.schema.json is the ontology's single source
// of truth. What lives here is only spec-sourced DISPLAY content (each zone's name
// and one-line purpose, condensed from spec v0.2 section 6). It is not a
// redefinition of any shared type and touches no event or canvas payload.

import type { Phase } from '@procezio/schema'

/** One of the fixed 8 zones as the navigation rail and panels present it. */
export interface ZoneDef {
  /** 1-8, the immutable zone number. */
  id: number
  /** The zone's short name (spec v0.2 section 6). */
  name: string
  /** The cognitive phase this zone belongs to (schema `Phase`). */
  phase: Phase
  /** One-line purpose, condensed from spec v0.2 section 6's "Captures" column. */
  purpose: string
}

/**
 * The 8 zones in their fixed order, grouped by the three cognitive phases:
 * UNDERSTAND (1-4), DIVERGE (5), CONVERGE (6-8). Frozen so the structure cannot
 * be mutated at runtime - it is the methodology, not configuration.
 */
export const ZONES: readonly ZoneDef[] = Object.freeze([
  {
    id: 1,
    name: 'Frame',
    phase: 'Understand',
    purpose:
      'Name, trigger, end state, owner, volume, and the north-star metric every later score answers to.',
  },
  {
    id: 2,
    name: 'Map',
    phase: 'Understand',
    purpose:
      'Draw the process in swimlanes with the five shapes - one lane per actor, handoffs marked.',
  },
  {
    id: 3,
    name: 'Friction',
    phase: 'Understand',
    purpose:
      'Tag friction against steps using the eight wastes (DOWNTIME); every friction pins to a step or gap.',
  },
  {
    id: 4,
    name: 'Data & Rules',
    phase: 'Understand',
    purpose: 'Per step: data, rules, and exceptions - the evidence layer later challenges cite.',
  },
  {
    id: 5,
    name: 'Ideation',
    phase: 'Diverge',
    purpose:
      'Generate automation candidates freely; scoring is forbidden here so ideas are not judged as they form.',
  },
  {
    id: 6,
    name: 'Prioritize',
    phase: 'Converge',
    purpose:
      'Human-first scoring on a 2x2 of effort versus benefit, one taxonomy rung per opportunity.',
  },
  {
    id: 7,
    name: 'Risk gate',
    phase: 'Converge',
    purpose: 'Five risk checks per shortlisted opportunity; open items block the business case.',
  },
  {
    id: 8,
    name: 'Improvement case',
    phase: 'Converge',
    purpose:
      'Agent-drafted from canvas data, locked until the risk gate clears; every figure links to its source zone.',
  },
])

/** The three phases in their fixed order - the spine of the navigation rail. */
export const PHASE_ORDER: readonly Phase[] = Object.freeze(['Understand', 'Diverge', 'Converge'])

/** A phase and the zones grouped under it, derived from ZONES (no duplication). */
export interface PhaseGroup {
  phase: Phase
  zones: readonly ZoneDef[]
}

/**
 * The navigation grouping: each phase with its zones, in fixed order. Derived from
 * ZONES so the phase->zone mapping has exactly one source.
 */
export const PHASES: readonly PhaseGroup[] = Object.freeze(
  PHASE_ORDER.map((phase) => ({
    phase,
    zones: ZONES.filter((zone) => zone.phase === phase),
  })),
)
