// The one modal overlay every dialog uses: the fixed backdrop that closes on pointer-down,
// the card that swallows it (stopPropagation), useModal's focus contract (Escape closes,
// Tab stays inside, focus returns to the invoker), and the dialog ARIA wiring. Seven
// dialogs pasted this JSX; the invariants that matter now live here once. Two stay
// per-dialog on purpose: the aria-label (e2e selects dialogs by name) and the z-index
// (the stacking order between palette, ceremony and export popover must not change).

import type { ReactNode } from 'react'
import { useModal } from './useModal.js'
import { theme } from '../theme.js'

interface ModalOverlayProps {
  /** The dialog's accessible name. Per-dialog and stable - e2e selects dialogs by it. */
  label: string
  onClose: () => void
  /** Stacking position, per-dialog (palette 50, most dialogs 60, export popover 70). */
  zIndex?: number
  /** Where the card sits: centered, top-centered (palette), or top-right (export popover). */
  align?: 'center' | 'top' | 'right'
  /** Card width; omit to let the content size the card (token simulation). */
  width?: string | number
  /** Card max-height; when set the card scrolls its own overflow (template picker). */
  maxHeight?: string | number
  /** Card padding. 0 means a chrome-less card whose children clip at the rounded corner. */
  padding?: string | number
  backdropOpacity?: number
  children: ReactNode
}

// The three card positions in use. 'top' is the palette's 12vh drop; 'right' hangs the
// export popover below the top bar (58px clears it), right-aligned.
const ALIGN: Record<'center' | 'top' | 'right', React.CSSProperties> = {
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' },
  right: { alignItems: 'flex-start', justifyContent: 'flex-end', padding: '58px 16px 0' },
}

export function ModalOverlay({
  label,
  onClose,
  zIndex = 60,
  align = 'center',
  width,
  maxHeight,
  padding = '20px 22px',
  backdropOpacity = 0.34,
  children,
}: ModalOverlayProps) {
  // Only mounted while the dialog is open, so the focus trap runs exactly then.
  const containerRef = useModal(true, onClose)
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onPointerDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: `rgba(0,0,0,${backdropOpacity})`,
        display: 'flex',
        zIndex,
        ...ALIGN[align],
      }}
    >
      <div
        ref={containerRef}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          ...(width !== undefined ? { width } : {}),
          ...(maxHeight !== undefined ? { maxHeight, overflowY: 'auto' as const } : {}),
          ...(padding === 0 ? { overflow: 'hidden' as const } : {}),
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          boxShadow: '0 24px 70px rgba(0,0,0,0.32)',
          padding,
        }}
      >
        {children}
      </div>
    </div>
  )
}
