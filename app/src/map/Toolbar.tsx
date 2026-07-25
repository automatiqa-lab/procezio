// M2-03 - the Zone 2 (Map) shape palette.
//
// View-only: the toolbar never touches canvas state directly. Each of the five
// buttons calls onAddShape(type, actor); the MapZone turns that into a node.created
// event through the M2-01 store (minting the node id at the app edge). The actor
// text box names the swimlane the new shape lands in - the lane id doubles as the
// actor slug (see the ontology note in events.ts), so "lanes organised by actor"
// holds without any explicit lane-creation event.

import { useState } from 'react'
import type { NodeType } from '@procezio/schema'
import { theme } from '../theme.js'

const SHAPES: readonly NodeType[] = ['Start', 'Step', 'Decision', 'Wait', 'End']

export interface ToolbarProps {
  /** Add a shape of `type` into the swimlane named by `actor`. */
  onAddShape: (type: NodeType, actor: string) => void
  /** Whether adding is possible yet (false until the session has opened). */
  disabled: boolean
}

export function Toolbar({ onAddShape, disabled }: ToolbarProps): JSX.Element {
  const [actor, setActor] = useState('Requester')

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '10px 16px',
        borderBottom: `1px solid ${theme.border}`,
        background: theme.surface,
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: theme.textMuted,
        }}
      >
        Actor / lane
        <input
          type="text"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Requester"
          aria-label="Actor for the swimlane the new shape lands in"
          style={{
            padding: '6px 8px',
            fontSize: 13,
            color: theme.text,
            background: '#ffffff',
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            width: 150,
          }}
        />
      </label>

      <span style={{ width: 1, height: 22, background: theme.border }} aria-hidden="true" />

      {SHAPES.map((type) => (
        <button
          key={type}
          type="button"
          disabled={disabled}
          onClick={() => onAddShape(type, actor)}
          title={`Add a ${type} node`}
          style={{
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            fontSize: 13,
            fontWeight: 600,
            color: theme.text,
            background: '#ffffff',
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            padding: '7px 12px',
          }}
        >
          + {type}
        </button>
      ))}
    </div>
  )
}
