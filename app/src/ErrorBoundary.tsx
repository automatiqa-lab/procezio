// A top-level error boundary so one thrown error (a bad render, an unexpected agent
// response path) does not white-screen the whole session. It catches render errors, shows
// a calm recover screen, and lets the user reload. Nothing is sent anywhere - the error is
// shown locally only (no telemetry).

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { theme } from './theme.js'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Local only - never leaves the machine (no telemetry). Kept for the console/devtools.
    console.error('Procezio hit an unexpected error:', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: theme.sans,
          color: theme.text,
        }}
      >
        <div
          style={{
            maxWidth: 560,
            padding: '28px 32px',
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: theme.friction,
              marginBottom: 10,
            }}
          >
            Something went wrong
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>
            The canvas hit an error
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: theme.textMuted, margin: '0 0 16px' }}>
            Reload to start again. If you had saved a <strong>.pnav</strong> file, you can open it
            to restore your session. This error stayed on your machine - nothing was sent anywhere.
          </p>
          <pre
            style={{
              fontSize: 12,
              fontFamily: theme.mono,
              color: theme.textMuted,
              background: '#ffffff',
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '10px 12px',
              overflowX: 'auto',
              margin: '0 0 18px',
            }}
          >
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              cursor: 'pointer',
              border: `1px solid ${theme.accent}`,
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 700,
              color: theme.onAccent,
              background: theme.accent,
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
