// C-TASK - the "connect a model" settings panel (BYO endpoint).
//
// Solo, security-first: the model runs wherever the USER points it - a hosted
// OpenAI-compatible endpoint or a local Ollama - and the key lives only in this
// component's memory. It is never written to a .pnav, a log, or a URL (ci:security-solo),
// and egress is limited to the endpoint the user typed.
//
// Connecting probes the model's capability tier and raises the store's tier, which is
// what lets tier-gated rules (the zone-6 anti-anchoring challenge, T1) begin to fire. The
// deterministic canvas works fully with no model connected (tier T0); the model only adds
// language and the higher-tier behaviors.

import { useRef, useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import { createLlmClient, type LlmClient, type LlmConfig, type Tier } from '@procezio/core'
import { PROVIDER_PRESETS, presetById } from './providers.js'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { makeValidator } from '../tasks/validator.js'
import { theme } from '../theme.js'

export interface SettingsPanelProps {
  store: StoreApi<CanvasStoreState>
  /** Hand the connected client (or null on disconnect/failure) up to the task runner. */
  onClient: (client: LlmClient | null) => void
}

/** A permissive object validator for the capability probe (measures JSON adherence). */
const probeValidator = makeValidator(
  (d: unknown): d is unknown => typeof d === 'object' && d !== null,
  '',
  'must be a JSON object',
)

const field = {
  width: '100%',
  padding: '7px 9px',
  fontSize: 13,
  color: theme.text,
  background: '#ffffff',
  border: `1px solid ${theme.border}`,
  borderRadius: 6,
  boxSizing: 'border-box' as const,
}

export function SettingsPanel({ store, onClient }: SettingsPanelProps): JSX.Element {
  const tier = useCanvasStore(store, (s) => s.tier)
  const setTier = useCanvasStore(store, (s) => s.setTier)
  const [open, setOpen] = useState(false)
  // Local-first: default to the Ollama preset (no key, private, offline).
  const [providerId, setProviderId] = useState(PROVIDER_PRESETS[0]!.id)
  const [endpoint, setEndpoint] = useState(PROVIDER_PRESETS[0]!.endpoint)
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Monotonic connect token: Disconnect (or a newer Connect) bumps it, so an older
  // in-flight probe that later resolves cannot silently resurrect a connection the
  // user explicitly turned off - an opt-out must stop egress for good.
  const connectRun = useRef(0)

  const preset = presetById(providerId)

  // Selecting a provider prefills its endpoint and clears the fields to its shape.
  const pickProvider = (id: string): void => {
    const p = presetById(id)
    setProviderId(id)
    setEndpoint(p.endpoint)
    setModel('')
    setApiKey('')
    setStatus(null)
  }

  const connect = async (): Promise<void> => {
    if (endpoint.trim().length === 0 || model.trim().length === 0) {
      setStatus({ kind: 'err', text: 'Endpoint and model are required.' })
      return
    }
    setBusy(true)
    setStatus(null)
    connectRun.current += 1
    const run = connectRun.current
    const config: LlmConfig = {
      endpoint: endpoint.trim(),
      model: model.trim(),
      authStyle: preset.authStyle,
      ...(apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
    }
    const client = createLlmClient({ config })
    try {
      const { tier: probed, reachable } = await client.probe(probeValidator)
      if (connectRun.current !== run) return // disconnected (or reconnected) while probing
      if (!reachable) {
        onClient(null)
        setTier('T0')
        setStatus({
          kind: 'err',
          text: 'No response from the endpoint. Check the URL and that the model is running.',
        })
      } else {
        onClient(client)
        setTier(probed)
        setStatus({
          kind: 'ok',
          text: `Connected. Capability ${probed} - the agent will now word its nudges.`,
        })
      }
    } catch {
      if (connectRun.current !== run) return // superseded; do not clobber the newer outcome
      onClient(null)
      setTier('T0')
      setStatus({ kind: 'err', text: 'Connection failed.' })
    } finally {
      if (connectRun.current === run) setBusy(false)
    }
  }

  const disconnect = (): void => {
    connectRun.current += 1 // invalidate any in-flight probe - the opt-out is final
    setBusy(false)
    onClient(null)
    setTier('T0')
    setStatus({ kind: 'ok', text: 'Disconnected - running on the deterministic canvas only.' })
  }

  const connected = tier !== 'T0'

  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.border}`,
        background: theme.surface2,
        flex: '0 0 auto',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 16px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.accent,
        }}
      >
        <span>◆ Model {connected ? `· ${tier as Tier}` : '· off'}</span>
        <span aria-hidden="true" style={{ color: theme.textMuted }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            aria-label="Model provider"
            value={providerId}
            onChange={(e) => pickProvider(e.target.value)}
            disabled={busy}
            style={field}
          >
            {PROVIDER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: theme.textMuted, lineHeight: 1.45 }}>
            {preset.note}
          </div>
          <input
            aria-label="Model endpoint"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="endpoint URL"
            disabled={busy}
            style={field}
          />
          <input
            aria-label="Model name"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={`e.g. ${preset.modelExample}`}
            disabled={busy}
            style={field}
          />
          {preset.keyNeeded ? (
            <>
              <input
                aria-label="API key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API key"
                disabled={busy}
                style={field}
              />
              <div style={{ fontSize: 10, color: theme.textMuted, lineHeight: 1.4 }}>
                The key stays in this tab&rsquo;s memory only - never saved to a file or sent
                anywhere but your endpoint.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10, color: theme.textMuted, lineHeight: 1.4 }}>
              No key needed here -{' '}
              {preset.authStyle === 'none' && preset.id !== 'ollama'
                ? 'the proxy holds it.'
                : 'this runs on your machine.'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy}
              style={{
                flex: 1,
                cursor: busy ? 'default' : 'pointer',
                border: `1px solid ${theme.accent}`,
                borderRadius: 7,
                padding: '8px',
                fontSize: 13,
                fontWeight: 700,
                color: theme.onAccent,
                background: theme.accent,
              }}
            >
              {busy ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}
            </button>
            {connected ? (
              <button
                type="button"
                onClick={disconnect}
                style={{
                  cursor: 'pointer',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 7,
                  padding: '8px 12px',
                  fontSize: 13,
                  color: theme.textMuted,
                  background: '#ffffff',
                }}
              >
                Disconnect
              </button>
            ) : null}
          </div>
          {status !== null ? (
            <div
              role="status"
              style={{
                fontSize: 11,
                lineHeight: 1.4,
                color: status.kind === 'err' ? theme.friction : theme.pass,
              }}
            >
              {status.text}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
