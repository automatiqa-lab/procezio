// v0.4 Shoebox widget (spec 01b section 7): notes and files beside the method.
//
// Free-text notes and dropped files sit apart from the eight zones. Files stay local; a
// per-item "include in agent context" consent is what lets an item's content reach the model -
// nothing is sent before that (egress-honest). The Auditor's extraction of pencil chips from
// consented items is wired with the LLM task layer (Phase 6); this card is the store-backed
// widget and the consent gate.

import { useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { LlmClient } from '@procezio/core'
import type { ExtractionChip, ShoeboxItem } from '@procezio/schema'
import type { CanvasStoreState } from '../store/canvas-store.js'
import { getCanvas } from '../store/canvas-store.js'
import { useCanvasStore } from '../store/use-canvas-store.js'
import { theme } from '../theme.js'
import { toast } from '../canvas/toast.js'
import { useT } from '../i18n/i18n.js'
import { runExtraction } from '../tasks/extraction.js'
import { summarizeCanvas } from '../tasks/chat.js'
import {
  buildShoeboxItemAddedCandidate,
  buildShoeboxItemConsentedCandidate,
  buildExtractionResultCandidate,
  buildShoeboxPencilNodeCandidate,
} from './events.js'

interface ShoeboxProps {
  store: StoreApi<CanvasStoreState>
  /** When a model is connected, consenting an item runs the Auditor extraction. */
  client?: LlmClient | null
}

// A stable empty array so the selector never returns a fresh reference (which would loop the
// store subscription - React error #185). Select the (possibly undefined) array, default here.
const NO_ITEMS: readonly ShoeboxItem[] = []

export function Shoebox({ store, client }: ShoeboxProps) {
  const sessionId = useCanvasStore(store, (s) => s.sessionId)
  const items = useCanvasStore(store, (s) => getCanvas(s).shoebox) ?? NO_ITEMS
  const [note, setNote] = useState('')
  // Auditor extraction chips per source item (pencil suggestions the human accepts).
  const [chipsByItem, setChipsByItem] = useState<Record<string, ExtractionChip[]>>({})
  // Items whose Auditor extraction is in flight - a per-item "reading…" indicator.
  const [extracting, setExtracting] = useState<Record<string, boolean>>({})
  // Whether a drag is hovering the panel (styles the drop affordance).
  const [dragOver, setDragOver] = useState(false)
  const t = useT()

  const addNote = (): void => {
    const text = note.trim()
    if (text === '' || sessionId === null) return
    store.getState().dispatch(
      buildShoeboxItemAddedCandidate(sessionId, {
        item_id: crypto.randomUUID(),
        kind: 'note',
        name: text,
      }),
    )
    setNote('')
  }

  const addFile = (file: File): void => {
    if (sessionId === null) return
    store.getState().dispatch(
      buildShoeboxItemAddedCandidate(sessionId, {
        item_id: crypto.randomUUID(),
        kind: 'file',
        name: file.name,
        content_type: file.type || 'application/octet-stream',
      }),
    )
  }

  const consent = (item: ShoeboxItem): void => {
    if (sessionId === null) return
    store.getState().dispatch(buildShoeboxItemConsentedCandidate(sessionId, item.item_id))
    // With a model connected, the Auditor extracts candidate chips from the item's text (a
    // note's text is its name; a file's content stays local, so only its name is available).
    if (client && item.name) {
      const canvasSummary = summarizeCanvas(getCanvas(store.getState()))
      setExtracting((prev) => ({ ...prev, [item.item_id]: true }))
      void runExtraction(client, item.name, canvasSummary)
        .then((chips) => {
          if (chips === null || chips.length === 0) return
          setChipsByItem((prev) => ({ ...prev, [item.item_id]: chips }))
          store.getState().dispatch(buildExtractionResultCandidate(sessionId, item.item_id, chips))
          toast(
            `Auditor read your ${item.kind} - ${chips.length} candidate${chips.length === 1 ? '' : 's'} to review.`,
          )
        })
        .finally(() => setExtracting((prev) => ({ ...prev, [item.item_id]: false })))
    }
  }

  const acceptChip = (itemId: string, chip: ExtractionChip): void => {
    if (sessionId === null) return
    store
      .getState()
      .dispatch(buildShoeboxPencilNodeCandidate(sessionId, crypto.randomUUID(), chip.text))
    setChipsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).filter((c) => c !== chip),
    }))
    toast('Added to the map as pencil - accept it there; the ledger will cite this source.')
  }

  // The whole panel is a drop target: "Drop a file" must be literally true.
  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    for (const file of Array.from(e.dataTransfer.files)) addFile(file)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        padding: '10px 12px',
        fontSize: 13,
        outline: dragOver ? `2px dashed ${theme.accent}` : 'none',
        outlineOffset: -4,
        borderRadius: 8,
      }}
    >
      <p style={{ margin: '0 0 10px', color: theme.textMuted, fontSize: 12 }}>
        Notes and files, beside the method. Files stay on your machine; content reaches the model
        only for items you include.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addNote()
          }}
          placeholder="Add a note…"
          aria-label="Shoebox note"
          style={{
            flex: '1 1 auto',
            padding: '6px 8px',
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            fontSize: 13,
            fontFamily: theme.sans,
          }}
        />
        <button
          type="button"
          onClick={addNote}
          style={{
            border: `1px solid ${theme.accent}`,
            background: theme.accent,
            color: theme.onAccent,
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>

      <label
        style={{
          display: 'inline-block',
          fontSize: 12,
          color: theme.accent,
          cursor: 'pointer',
          marginBottom: 12,
        }}
      >
        {t('shoebox.drop')}
        <input
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            for (const file of Array.from(e.target.files ?? [])) addFile(file)
            e.target.value = ''
          }}
        />
      </label>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {items.length === 0 && (
          <li style={{ color: theme.textFaint, fontSize: 12 }}>Nothing in the Shoebox yet.</li>
        )}
        {items.map((item) => (
          <li
            key={item.item_id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '7px 9px',
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              background: theme.surface,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true">{item.kind === 'file' ? '📄' : '📝'}</span>
              <span style={{ flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.name ?? item.item_id}
              </span>
              {item.consented ? (
                <span style={{ fontSize: 11, color: theme.pass, fontWeight: 600 }}>included ✓</span>
              ) : (
                <button
                  type="button"
                  onClick={() => consent(item)}
                  title="Send this item's content to your configured model"
                  style={{
                    fontSize: 11,
                    color: theme.accent,
                    background: 'transparent',
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  include
                </button>
              )}
            </div>
            {/* In-flight extraction: the consent visibly leads somewhere, not into silence. */}
            {extracting[item.item_id] === true && (
              <div role="status" style={{ fontSize: 11, color: theme.textMuted }}>
                ⏳ {t('shoebox.reading')}
              </div>
            )}
            {/* Auditor extraction chips (pencil): candidates the item implies, not on the map. */}
            {(chipsByItem[item.item_id] ?? []).map((chip, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  border: `1.5px dashed ${theme.pencil}`,
                  background: theme.pencilSoft,
                  color: '#7A560B',
                  borderRadius: 8,
                  padding: '6px 8px',
                }}
              >
                Auditor: {chip.text}
                <button
                  type="button"
                  onClick={() => acceptChip(item.item_id, chip)}
                  style={{
                    marginLeft: 8,
                    color: theme.accent,
                    fontWeight: 700,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  + add as pencil step
                </button>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
