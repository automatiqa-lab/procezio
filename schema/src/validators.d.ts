/**
 * DO NOT EDIT BY HAND.
 * Generated from schema/canvas.schema.json by `corepack pnpm --filter @procezio/schema gen:validators`.
 * Type surface for the precompiled ajv standalone validators in ./validators.cjs.
 * CI job ci:validators-drift fails if this file drifts.
 */
import type { ValidateFunction } from 'ajv'
import type { Canvas, EventEnvelope } from './canvas.types'

/** Precompiled validator for the root Canvas document (schema/canvas.schema.json). */
export declare const validateCanvas: ValidateFunction<Canvas>

/** Precompiled validator for the EventEnvelope contract (#/$defs/EventEnvelope). */
export declare const validateEventEnvelope: ValidateFunction<EventEnvelope>
