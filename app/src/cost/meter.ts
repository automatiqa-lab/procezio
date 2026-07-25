// v0.4 live cost meter (spec 01b section 12, G2): a client-computed running estimate.
//
// No telemetry anywhere; the cost meter is computed in the browser from the metering every LLM
// call already returns (prompt/completion characters + model). It is an ESTIMATE - characters are
// converted to tokens with a rough divisor and priced from a small per-model table - so it is
// always shown honesty-tagged ("est."). This module is pure math + a tiny subscribe/record bus
// (like the toast bus); nothing here touches the network.

import type { LlmClient, LlmMetering } from '@procezio/core'

/** Rough characters-per-token for English + JSON. Deliberately approximate; the meter is an est. */
const CHARS_PER_TOKEN = 4

/** USD per 1,000,000 tokens (input, output), by model-id substring. Approximate list prices. */
const MODEL_PRICES: Array<{ match: string; inUsd: number; outUsd: number }> = [
  { match: 'haiku', inUsd: 1.0, outUsd: 5.0 },
  { match: 'sonnet', inUsd: 3.0, outUsd: 15.0 },
  { match: 'opus', inUsd: 15.0, outUsd: 75.0 },
]
// When the model id matches nothing known, price it as a mid-tier model rather than zero, so the
// meter never understates by pretending an unknown model is free.
const DEFAULT_PRICE = { inUsd: 3.0, outUsd: 15.0 }

function priceFor(model: string): { inUsd: number; outUsd: number } {
  const id = model.toLowerCase()
  return MODEL_PRICES.find((p) => id.includes(p.match)) ?? DEFAULT_PRICE
}

/** Estimate the USD cost of one call from its character counts and model. Always >= 0. */
export function estimateUsd(model: string, promptChars: number, completionChars: number): number {
  const { inUsd, outUsd } = priceFor(model)
  const inTokens = Math.max(0, promptChars) / CHARS_PER_TOKEN
  const outTokens = Math.max(0, completionChars) / CHARS_PER_TOKEN
  return (inTokens * inUsd + outTokens * outUsd) / 1_000_000
}

/** The running total the meter shows. */
export interface CostSnapshot {
  calls: number
  usd: number
}

type Listener = (snapshot: CostSnapshot) => void

/**
 * A tiny accumulate-and-subscribe bus for cost. Each LLM call reports its metering via record();
 * subscribers (the top-bar meter) get the new running total. reset() clears it (a new session).
 */
export class CostMeter {
  private snapshot: CostSnapshot = { calls: 0, usd: 0 }
  private readonly listeners = new Set<Listener>()

  record(metering: LlmMetering): void {
    this.snapshot = {
      calls: this.snapshot.calls + 1,
      usd:
        this.snapshot.usd +
        estimateUsd(metering.model, metering.prompt_chars, metering.completion_chars),
    }
    for (const l of this.listeners) l(this.snapshot)
  }

  reset(): void {
    this.snapshot = { calls: 0, usd: 0 }
    for (const l of this.listeners) l(this.snapshot)
  }

  get(): CostSnapshot {
    return this.snapshot
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

/**
 * Wrap an LlmClient so every call reports its metering to `meter`. Transparent: it calls through
 * to the real client and records the metering each result carries. requestJson's ok:false
 * results still carry (and record) metering; a complete() that THROWS (timeout/cancel)
 * records nothing - the provider may have spent tokens we cannot see, so the meter reads
 * "at least this much", never an exact bill. The methodology is unaffected - this only
 * observes.
 */
export function meteredClient(client: LlmClient, meter: CostMeter): LlmClient {
  return {
    async complete(messages, opts) {
      const r = await client.complete(messages, opts)
      meter.record(r.metering)
      return r
    },
    async requestJson(messages, validate, opts) {
      const r = await client.requestJson(messages, validate, opts)
      meter.record(r.metering)
      return r
    },
    // A probe is a one-off reachability check that returns no metering; left unmetered.
    async probe(validate) {
      return client.probe(validate)
    },
  }
}
