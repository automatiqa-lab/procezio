// C-LLM - the slim, fetch-based LLM client (isomorphic).
//
// This is the GENERATIVE language surface of the layering principle (constitution p10):
// the deterministic control plane (rules, budget, projection) decides WHETHER to act
// and WHAT is true; this client only decides HOW to say it and does bounded generative
// work. It never enforces a rule, never mutates canvas state, and never invents a
// number that is not handed to it.
//
// Slim by construction: no SDK, no framework. One small OpenAI-compatible request shape
// over an INJECTED transport (default: fetch). Injecting the transport is what makes the
// whole client deterministic under `node --test` - a fake transport returns canned model
// output, so every path (retry, repair, probe, fallback) is exercised with no network.
//
// Isomorphic: imports nothing from node:*, reads no wall clock except through an injected
// `sleep` (so backoff is testable and replay-safe), and uses only `fetch` in the default
// transport (present in the browser and Node >= 20). BYO endpoint: the browser calls the
// user's model directly (OpenAI-compatible or local Ollama); egress is limited to that
// one configured origin (ci:security-solo), and the API key lives only in memory - never
// in a .pnav, a log, or a URL.

// A minimal structural type for a precompiled schema validator - exactly what the
// schema package's standalone (eval-free) validators are: a type-guard callable with an
// optional `errors` array. Declared locally so core imports NO ajv at runtime OR at
// type-time, keeping the isomorphic bundle CSP-safe and dependency-free. The generated
// validateEventEnvelope / validateCanvas satisfy this shape.
interface SchemaError {
  instancePath?: string
  message?: string
}
export interface SchemaValidator<T> {
  (data: unknown): data is T
  errors?: SchemaError[] | null
}

/** One chat message in the OpenAI-compatible shape. */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * How the API key is presented, since providers differ: OpenAI/most compatibles use a
 * Bearer header; Anthropic-native uses x-api-key; Azure OpenAI uses api-key; a local
 * model or a proxy that injects auth itself needs none. Defaults to bearer.
 */
export type AuthStyle = 'bearer' | 'x-api-key' | 'api-key' | 'none'

/** A model endpoint configuration. `fallback` chains to the next config on failure. */
export interface LlmConfig {
  /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 or http://localhost:11434/v1 . */
  endpoint: string
  /** Model id, e.g. gpt-4o-mini or llama3.1 . */
  model: string
  /** API key. Optional (a local model or an auth-injecting proxy needs none). Kept in memory only. */
  apiKey?: string
  /** How to present the key (default 'bearer'). 'none' sends no auth header. */
  authStyle?: AuthStyle
  /** Ordered fallbacks tried when this config errors (config fallback chains). */
  fallback?: LlmConfig[]
}

/** What a transport must implement: turn a prepared request into raw model text. */
export type LlmTransport = (req: LlmRequest) => Promise<string>

/** A prepared, transport-agnostic request (already resolved to one config). */
export interface LlmRequest {
  config: LlmConfig
  messages: LlmMessage[]
  /** Ask the model to bias toward strict JSON (response_format hint when supported). */
  json: boolean
  /** Caller-supplied cancellation (a UI Cancel button). Aborting skips retry/fallback. */
  signal?: AbortSignal
}

/** Per-call options for complete/requestJson. */
export interface LlmCallOptions {
  /** Cancels the in-flight call; the rejection message contains "cancelled". */
  signal?: AbortSignal
}

/** Per-call metering, surfaced so the caller can log llm.request/response events. */
export interface LlmMetering {
  model: string
  prompt_chars: number
  completion_chars: number
  /** Transport attempts made (1 = first try succeeded). */
  attempts: number
  /** Schema repair rounds used (0 = valid first parse). */
  repairs: number
}

/** Result of a plain completion. */
export interface CompletionResult {
  text: string
  metering: LlmMetering
}

/** Result of a schema-validated request. `ok:false` means no valid value after repairs. */
export type JsonResult<T> =
  | { ok: true; value: T; metering: LlmMetering }
  | { ok: false; error: string; metering: LlmMetering }

/** Capability tiers (spec/02b). T0 = no usable model; higher = more reliable structure. */
export type Tier = 'T0' | 'T1' | 'T2' | 'T3'

export interface LlmClientOptions {
  config: LlmConfig
  /** Injected transport. Defaults to a fetch-based OpenAI-compatible transport. */
  transport?: LlmTransport
  /** Max transport retries per config before falling back (default 2). */
  maxRetries?: number
  /** Max schema repair rounds (default 2, per the architecture). */
  maxRepairs?: number
  /** Injected delay for backoff (default real setTimeout). Tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>
  /** Per-request timeout for the DEFAULT transport (ignored when `transport` is injected). */
  timeoutMs?: number
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Default per-request ceiling: a reachable-but-hung endpoint must fail, not spin forever. */
export const DEFAULT_TIMEOUT_MS = 45_000

export interface FetchTransportOptions {
  /** Per-request timeout in ms (default DEFAULT_TIMEOUT_MS). The socket is aborted on expiry. */
  timeoutMs?: number
}

/**
 * The default transport: one OpenAI-compatible POST to {endpoint}/chat/completions,
 * returning choices[0].message.content. Throws on a non-2xx or a malformed body so the
 * retry/fallback logic above can react. Egress is limited to config.endpoint. Every
 * request carries an abort timeout: an endpoint that accepts the socket but never
 * replies (stalled Ollama, dead proxy) surfaces as a clear error instead of an
 * indefinitely-spinning UI.
 */
export function createFetchTransport(options: FetchTransportOptions = {}): LlmTransport {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return async (req) => {
    const url = req.config.endpoint.replace(/\/+$/, '') + '/chat/completions'
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const key = req.config.apiKey
    const style = req.config.authStyle ?? 'bearer'
    if (key !== undefined && key.length > 0 && style !== 'none') {
      // Present the key the way the provider expects. Local models / auth-injecting
      // proxies use 'none' and send no key from the browser at all.
      if (style === 'x-api-key') headers['x-api-key'] = key
      else if (style === 'api-key') headers['api-key'] = key
      else headers.authorization = `Bearer ${key}`
    }
    const body: Record<string, unknown> = {
      model: req.config.model,
      messages: req.messages,
      temperature: 0.2,
    }
    // NB: we deliberately do NOT send an OpenAI `response_format` hint. It is not
    // portable - OpenAI wants {type:'json_object'}, Anthropic's compatible endpoint wants
    // 'json_schema' (and 400s on json_object), Ollama uses a separate `format` field. JSON
    // adherence is instead driven by the prompt ("reply with JSON only") plus the
    // extractJson + validate/repair loop in requestJson, which works across every provider.
    // req.json is kept on the request type for a future provider-specific opt-in.
    void req.json
    // One controller aborts the socket for either reason: our timeout, or the caller's
    // cancel signal. Which one fired decides the error message the UI shows. The guard
    // covers the WHOLE exchange - headers AND body: a provider that returns 200 then
    // stalls (or trickles) the body is exactly the reachable-but-hung case, and a Cancel
    // pressed mid-body must still stop the read (fetch aborts res.json() via the same
    // signal). So the timer/listener are torn down only after the body is consumed.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onCancel = (): void => controller.abort()
    if (req.signal !== undefined) {
      if (req.signal.aborted) controller.abort()
      else req.signal.addEventListener('abort', onCancel, { once: true })
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`LLM endpoint returned ${res.status}`)
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const text = data.choices?.[0]?.message?.content
      if (typeof text !== 'string') throw new Error('LLM response had no message content')
      return text
    } catch (e) {
      if (req.signal?.aborted) throw new Error('LLM request cancelled')
      // Our own timeout firing; name it so the UI can say something useful.
      if (controller.signal.aborted) {
        throw new Error(`LLM request timed out after ${Math.round(timeoutMs / 1000)}s`)
      }
      throw e
    } finally {
      clearTimeout(timer)
      req.signal?.removeEventListener('abort', onCancel)
    }
  }
}

/** Extract the first JSON object from model text (handles ```json fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? text).trim()
  // Try the whole candidate, then the first {...} span.
  const spans = [candidate]
  const brace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (brace !== -1 && lastBrace > brace) spans.push(candidate.slice(brace, lastBrace + 1))
  for (const s of spans) {
    try {
      return JSON.parse(s)
    } catch {
      /* try next span */
    }
  }
  throw new Error('no JSON object found in model output')
}

export interface LlmClient {
  /** A plain text completion with retry + fallback. */
  complete(messages: LlmMessage[], opts?: LlmCallOptions): Promise<CompletionResult>
  /**
   * Request JSON matching `validate`, repairing up to maxRepairs times by feeding the
   * ajv errors back to the model. The rule/decision layer, not this call, decides
   * whether to act on the result.
   */
  requestJson<T>(
    messages: LlmMessage[],
    validate: SchemaValidator<T>,
    opts?: LlmCallOptions,
  ): Promise<JsonResult<T>>
  /** Probe the model's structural reliability and return a capability tier. */
  probe(validate: SchemaValidator<unknown>): Promise<{ tier: Tier; reachable: boolean }>
}

/**
 * Build the slim client. All effects (network, clock) enter through the injected
 * transport + sleep, so the whole thing is a pure function of its inputs under test.
 */
export function createLlmClient(options: LlmClientOptions): LlmClient {
  const transport =
    options.transport ??
    createFetchTransport(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {})
  const maxRetries = options.maxRetries ?? 2
  const maxRepairs = options.maxRepairs ?? 2
  const sleep = options.sleep ?? realSleep

  /** Walk config -> fallback chain, retrying each with exponential backoff. */
  async function send(
    messages: LlmMessage[],
    json: boolean,
    signal?: AbortSignal,
  ): Promise<{ text: string; attempts: number; config: LlmConfig }> {
    const chain: LlmConfig[] = [options.config, ...(options.config.fallback ?? [])]
    let attempts = 0
    let lastErr: unknown
    for (const config of chain) {
      for (let i = 0; i <= maxRetries; i += 1) {
        attempts += 1
        try {
          const text = await transport({
            config,
            messages,
            json,
            ...(signal !== undefined ? { signal } : {}),
          })
          return { text, attempts, config }
        } catch (e) {
          lastErr = e
          // A cancel is the user changing their mind, not a transient fault: no retry,
          // no fallback - surface it immediately.
          if (signal?.aborted) {
            throw e instanceof Error ? e : new Error('LLM request cancelled')
          }
          // Exponential backoff before the next retry (not after the last).
          if (i < maxRetries) await sleep(2 ** i * 100)
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('LLM request failed')
  }

  function meter(
    messages: LlmMessage[],
    text: string,
    attempts: number,
    repairs: number,
    model: string,
  ): LlmMetering {
    return {
      model,
      prompt_chars: messages.reduce((n, m) => n + m.content.length, 0),
      completion_chars: text.length,
      attempts,
      repairs,
    }
  }

  return {
    async complete(messages, opts) {
      const { text, attempts, config } = await send(messages, false, opts?.signal)
      return { text, metering: meter(messages, text, attempts, 0, config.model) }
    },

    async requestJson<T>(
      messages: LlmMessage[],
      validate: SchemaValidator<T>,
      opts?: LlmCallOptions,
    ): Promise<JsonResult<T>> {
      let convo = messages
      let totalAttempts = 0
      let lastModel = options.config.model
      // Honest accumulation: every repair round RE-SENDS the grown conversation and
      // produces its own (billed) completion, so prompt/completion chars sum across
      // rounds - metering only the first prompt and the last completion understated
      // real spend severalfold exactly for the weak models that need repairs.
      let promptChars = 0
      let completionChars = 0
      const cumulative = (repairs: number): LlmMetering => ({
        model: lastModel,
        prompt_chars: promptChars,
        completion_chars: completionChars,
        attempts: totalAttempts,
        repairs,
      })
      for (let repair = 0; repair <= maxRepairs; repair += 1) {
        promptChars += convo.reduce((n, m) => n + m.content.length, 0)
        let sent
        try {
          sent = await send(convo, true, opts?.signal)
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : 'transport failed',
            metering: cumulative(repair),
          }
        }
        totalAttempts += sent.attempts
        completionChars += sent.text.length
        lastModel = sent.config.model
        let parsed: unknown
        try {
          parsed = extractJson(sent.text)
        } catch {
          // Unparseable: ask again with a terse instruction, if repairs remain.
          convo = [
            ...messages,
            { role: 'user', content: 'Return ONLY a valid JSON object, no prose, no code fences.' },
          ]
          continue
        }
        if (validate(parsed)) {
          return { ok: true, value: parsed, metering: cumulative(repair) }
        }
        // Invalid: feed the ajv errors back for one repair round.
        const errs = (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; ')
        convo = [
          ...messages,
          { role: 'assistant', content: sent.text },
          {
            role: 'user',
            content: `That JSON did not match the required schema (${errs}). Return corrected JSON only.`,
          },
        ]
      }
      return {
        ok: false,
        error: 'model output never matched the schema after repairs',
        metering: cumulative(maxRepairs),
      }
    },

    async probe(validate) {
      // A tiny structured request: reachable + valid-first-try => T3; valid after a
      // repair => T2; reachable but never valid => T1; unreachable => T0.
      const messages: LlmMessage[] = [
        { role: 'system', content: 'You return only compact JSON.' },
        { role: 'user', content: 'Reply with a JSON object: {"ok": true}.' },
      ]
      let result: JsonResult<unknown>
      try {
        result = await this.requestJson(messages, validate)
      } catch {
        return { tier: 'T0', reachable: false }
      }
      if (!result.ok) {
        // Reachable (metering has attempts) but no valid JSON => T1 (free text only).
        return {
          tier: result.metering.attempts > 0 ? 'T1' : 'T0',
          reachable: result.metering.attempts > 0,
        }
      }
      return { tier: result.metering.repairs === 0 ? 'T3' : 'T2', reachable: true }
    },
  }
}
