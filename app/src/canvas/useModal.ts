// Shared modal focus management - the one hook every dialog overlay uses.
//
// A dialog that does not trap focus is a dialog only for mouse users: keyboard and
// screen-reader users Tab straight out into the canvas behind it, and closing strands
// their focus at the document root. This hook gives every overlay the same contract:
// Escape closes, Tab cycles inside the container, focus lands on the first focusable
// element on open (or a caller-chosen one), and returns to the invoking element on
// close. Pair it with aria-modal="true" on the overlay.

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The open-modal stack. Dialogs CAN stack (the always-on ⌘K shortcut opens the palette
// over the ceremony), and every instance listens on document - stopPropagation does not
// stop other listeners on the same target. Only the TOPMOST modal may handle Escape/Tab,
// so one Escape closes one dialog, never the whole stack.
const modalStack: symbol[] = []

export function useModal(
  open: boolean,
  onClose: () => void,
): React.MutableRefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // The close callback is read through a ref so a new identity per render does not
  // tear down and re-run the whole focus effect. Updated in an effect, never in render.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const token = Symbol('modal')
    modalStack.push(token)
    const isTopmost = (): boolean => modalStack[modalStack.length - 1] === token
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusables = (): HTMLElement[] =>
      Array.from(containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])

    // Initial focus after paint (the container mounts in the same commit).
    const raf = requestAnimationFrame(() => {
      const target = focusables()[0]
      if (target !== undefined && containerRef.current?.contains(document.activeElement) !== true) {
        target.focus()
      }
    })

    const onKey = (e: KeyboardEvent): void => {
      if (!isTopmost()) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const first = list[0]!
      const last = list[list.length - 1]!
      const active = document.activeElement
      // Cycle at the edges; a focus outside the container is pulled back in.
      if (e.shiftKey && (active === first || !containerRef.current?.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !containerRef.current?.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      const at = modalStack.indexOf(token)
      if (at !== -1) modalStack.splice(at, 1)
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      invoker?.focus()
    }
  }, [open])

  return containerRef
}
