// v0.4 toast host: renders the current toast and auto-dismisses. Text-only (never HTML).

import { useEffect, useRef, useState } from 'react'
import { clearToast, subscribeToast } from './toast.js'
import { theme } from '../theme.js'

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return subscribeToast((m) => {
      setMessage(m)
      if (timer.current) clearTimeout(timer.current)
      if (m !== null) timer.current = setTimeout(() => clearToast(), 5200)
    })
  }, [])

  if (message === null) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        maxWidth: 540,
        background: theme.text,
        color: theme.bg,
        borderRadius: 12,
        padding: '11px 16px',
        fontSize: 13,
        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => clearToast()}
        aria-label="Dismiss"
        style={{
          border: 'none',
          background: 'transparent',
          color: theme.pass,
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
