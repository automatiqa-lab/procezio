// v0.4 command palette (spec 01b section 2, A5): go-to-zone, commit, export, summon.
//
// Ctrl/Cmd+K opens it; its absence would read as unfinished. It only navigates and triggers
// existing actions - it decides nothing the rules do not already allow.

import { useEffect, useMemo, useRef, useState } from 'react'
import { theme } from '../theme.js'
import { ModalOverlay } from './ModalOverlay.js'

export interface Command {
  id: string
  label: string
  hint?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  commands: Command[]
  onClose: () => void
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      // Focus after paint.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [commands, query])

  if (!open) return null

  const run = (c: Command | undefined) => {
    if (!c) return
    onClose()
    c.run()
  }

  return (
    <ModalOverlay
      label="Command palette"
      onClose={onClose}
      zIndex={50}
      align="top"
      width="min(560px, 92vw)"
      padding={0}
      backdropOpacity={0.28}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIndex(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setIndex((i) => Math.min(filtered.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIndex((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            run(filtered[index])
          } else if (e.key === 'Escape') {
            onClose()
          }
        }}
        placeholder="Type a command…  (go to a zone, commit, export)"
        aria-label="Command"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '14px 16px',
          border: 'none',
          borderBottom: `1px solid ${theme.border}`,
          fontSize: 15,
          fontFamily: theme.sans,
          outline: 'none',
          background: 'transparent',
          color: theme.text,
        }}
      />
      <ul style={{ listStyle: 'none', margin: 0, padding: 6, maxHeight: 320, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <li style={{ padding: '10px 12px', fontSize: 13, color: theme.textMuted }}>
            No matching command.
          </li>
        )}
        {filtered.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              onPointerEnter={() => setIndex(i)}
              onClick={() => run(c)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderRadius: 8,
                padding: '9px 12px',
                cursor: 'pointer',
                fontSize: 14,
                color: theme.text,
                background: i === index ? theme.accentSoft : 'transparent',
              }}
            >
              <span style={{ flex: '1 1 auto' }}>{c.label}</span>
              {c.hint && (
                <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: theme.mono }}>
                  {c.hint}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </ModalOverlay>
  )
}
