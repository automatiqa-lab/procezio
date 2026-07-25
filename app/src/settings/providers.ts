// C-TASK - model provider presets (BYO, local-first).
//
// Procezio is Apache-2.0 and BYO-model: any adopter brings their own endpoint. Providers
// differ (auth header, browser/CORS rules, URL shape), so rather than assume one, the
// setup offers presets that fill sensible defaults and say plainly whether a provider
// works direct from the browser or needs the proxy (docker/). Local-first: a local model
// (Ollama) is the default - no key, private, offline, and the constitution's own posture
// ("your process knowledge never leaves your boundary").
//
// Pure data + a tiny helper, so it is trivially headless-testable.

import type { AuthStyle } from '@procezio/core'

export interface ProviderPreset {
  id: string
  label: string
  /** Default endpoint to prefill. */
  endpoint: string
  /** An example model id for the placeholder. */
  modelExample: string
  /** How this provider wants the key presented. */
  authStyle: AuthStyle
  /** Whether the user supplies a key in the browser (false = local, or proxy injects it). */
  keyNeeded: boolean
  /** One-line guidance: direct from the browser, or via the proxy. */
  note: string
}

/** The presets, local-first. `custom` is the escape hatch for any OpenAI-compatible URL. */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'ollama',
    label: 'Local (Ollama)',
    endpoint: 'http://localhost:11434/v1',
    modelExample: 'llama3.1',
    authStyle: 'none',
    keyNeeded: false,
    note: 'Runs on your machine - no key, private, works offline. Start Ollama and pull a model first (ollama pull llama3.1).',
  },
  {
    id: 'lmstudio',
    label: 'Local (LM Studio)',
    endpoint: 'http://localhost:1234/v1',
    modelExample: 'qwen2.5-14b-instruct',
    authStyle: 'none',
    keyNeeded: false,
    note: 'Runs on your machine - no key, private, works offline. Start the LM Studio local server (Developer tab) with a model loaded.',
  },
  {
    id: 'openai',
    label: 'OpenAI-compatible',
    endpoint: 'https://api.openai.com/v1',
    modelExample: 'gpt-4o-mini',
    authStyle: 'bearer',
    keyNeeded: true,
    note: 'Also vLLM, LiteLLM, together.ai and friends. The shipped build blocks direct cloud calls (CSP allows only local endpoints) - run the proxy (docker/) or self-host with an amended CSP. Direct browser calls also expose your key.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    modelExample: 'anthropic/claude-haiku-4.5',
    authStyle: 'bearer',
    keyNeeded: true,
    note: 'One key, many models. The shipped build blocks direct cloud calls (CSP allows only local endpoints) - run the proxy (docker/) or self-host with an amended CSP.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelExample: 'gemini-2.5-flash',
    authStyle: 'bearer',
    keyNeeded: true,
    note: "Google's OpenAI-compatible endpoint. Same cloud rule: the shipped CSP blocks direct calls - use the proxy (docker/) or self-host with an amended CSP.",
  },
  {
    id: 'anthropic',
    label: 'Anthropic / Claude (via proxy)',
    endpoint: 'http://localhost:8080/v1',
    modelExample: 'claude-haiku-4-5-20251001',
    authStyle: 'none',
    keyNeeded: false,
    note: 'Claude blocks direct browser calls. Run the nginx proxy (docker/), point here, leave the key BLANK - the proxy holds it.',
  },
  {
    id: 'azure',
    label: 'Azure OpenAI (via proxy)',
    endpoint: 'http://localhost:8080/v1',
    modelExample: 'your-deployment-name',
    authStyle: 'none',
    keyNeeded: false,
    note: 'Azure uses an api-key header and deployment URLs. Run the proxy to handle both; point here, key BLANK.',
  },
  {
    id: 'custom',
    label: 'Custom / other',
    endpoint: '',
    modelExample: 'model-id',
    authStyle: 'bearer',
    keyNeeded: true,
    note: 'Any OpenAI-compatible /chat/completions endpoint. Pick the auth style your provider expects.',
  },
] as const

/** Find a preset by id (defaults to the first, local Ollama). */
export function presetById(id: string): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[0]!
}
