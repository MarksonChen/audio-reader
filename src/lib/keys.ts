/** Keydown handler for popups: Escape closes them even while one of their inputs has focus. */
export function closeOnEscape(onClose: () => void) {
  return (e: { key: string; stopPropagation: () => void }) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }
}
