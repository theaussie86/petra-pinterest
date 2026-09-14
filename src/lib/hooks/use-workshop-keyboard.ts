import { useEffect, useRef } from 'react'

/**
 * The keyboard actions available while reviewing pin templates in the Werkstatt.
 * Each maps to the same behaviour as its action-bar button so 30 templates per
 * article can be worked through without leaving the keyboard:
 * - `j` / `k` — next / previous template in the active workspace
 * - `f`       — approve (Freigeben) and advance
 * - `c`       — copy the image prompt
 * - `r`       — open the "Änderung wünschen" dialog (focus the feedback field)
 */
export interface WorkshopKeyboardHandlers {
  onNext: () => void
  onPrev: () => void
  onApprove: () => void
  onCopyPrompt: () => void
  onRequestRevision: () => void
}

/**
 * Whether a keyboard shortcut should be ignored: the user is typing in a form
 * field / contenteditable, or a modal dialog is open. Keeps the review shortcuts
 * from hijacking normal text entry (e.g. the revision feedback textarea).
 */
export function shouldIgnoreShortcut(target: EventTarget | null): boolean {
  if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) {
    return true
  }
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/**
 * Register the Werkstatt review shortcuts on the document while `enabled`.
 * Handlers are read through a ref so the listener is attached once and always
 * calls the latest callbacks.
 */
export function useWorkshopKeyboard(handlers: WorkshopKeyboardHandlers, enabled = true): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (shouldIgnoreShortcut(event.target)) return

      const h = handlersRef.current
      const action: Record<string, (() => void) | undefined> = {
        j: h.onNext,
        k: h.onPrev,
        f: h.onApprove,
        c: h.onCopyPrompt,
        r: h.onRequestRevision,
      }
      const handler = action[event.key]
      if (!handler) return

      event.preventDefault()
      handler()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
