// The one SchemaValidator factory for the hand-rolled task guards.
//
// Every C-TASK validates the model's JSON with a hand type-guard carrying ajv-shaped
// `errors` (the repair loop feeds them back to the model verbatim). The guards exist by
// hand at all because the schema package ships precompiled validators only for the
// top-level Canvas/EventEnvelope - and the Object.assign boilerplate around each guard
// was pasted per task. This factory keeps each site down to its actual guard logic.

import type { SchemaValidator } from '@procezio/core'

/** Wrap a type-guard as a SchemaValidator carrying a single fixed ajv-shaped error. */
export function makeValidator<T>(
  guard: (d: unknown) => d is T,
  instancePath: string,
  message: string,
): SchemaValidator<T> {
  return Object.assign(guard, {
    errors: [{ instancePath, message }] as Array<{
      instancePath?: string
      message?: string
    }> | null,
  })
}
