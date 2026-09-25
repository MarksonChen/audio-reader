const KEEP = /[\p{L}\p{N}]/u

export interface Normalized {
  /** Normalized text: letters and digits only, NFKC, lower-cased. */
  norm: string
  /** For every UTF-16 code unit of `norm`, the index of the source character. */
  map: Int32Array
}

export function normalizeChar(ch: string): string {
  let out = ''
  for (const cp of ch.normalize('NFKC').toLowerCase()) {
    if (KEEP.test(cp)) out += cp
  }
  return out
}

export function isContentChar(ch: string): boolean {
  return normalizeChar(ch).length > 0
}

export function normalizeChars(chars: string[]): Normalized {
  const parts: string[] = []
  const map: number[] = []
  for (let i = 0; i < chars.length; i++) {
    const n = normalizeChar(chars[i])
    if (!n) continue
    parts.push(n)
    for (let k = 0; k < n.length; k++) map.push(i)
  }
  return { norm: parts.join(''), map: Int32Array.from(map) }
}
