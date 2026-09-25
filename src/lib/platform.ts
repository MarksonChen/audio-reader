/** Keyboard labels follow the platform: ⌘ ⌥ ⇧ on Apple devices, Ctrl / Alt / Shift elsewhere. */
export const IS_MAC =
  typeof navigator !== 'undefined' && (/Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Macintosh|iPhone|iPad/.test(navigator.userAgent))

export const KEYS = IS_MAC
  ? { mod: '⌘', alt: '⌥', shift: '⇧', joiner: ' + ' }
  : { mod: 'Ctrl', alt: 'Alt', shift: 'Shift', joiner: ' + ' }

/** Compact form for button tooltips: "⌘," on Mac, "Ctrl+," elsewhere. */
export function combo(modifier: string, key: string): string {
  return IS_MAC ? `${modifier}${key}` : `${modifier}+${key}`
}
