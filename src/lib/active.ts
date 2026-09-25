import type { AlignedDoc } from './types'

export interface ActiveIndex {
  starts: Float64Array
  ids: Int32Array
}

/** Sorted start times of synced sentences, for fast lookup by media time. */
export function buildActiveIndex(doc: AlignedDoc | null): ActiveIndex {
  if (!doc) return { starts: new Float64Array(0), ids: new Int32Array(0) }
  const synced = doc.sentences.filter((s) => s.synced)
  const list = synced.length ? synced : doc.sentences
  return {
    starts: Float64Array.from(list.map((s) => s.start)),
    ids: Int32Array.from(list.map((s) => s.id)),
  }
}

/** Id of the last synced sentence starting at or before `t`, or -1. */
export function findActive(index: ActiveIndex, t: number): number {
  const { starts, ids } = index
  let lo = 0
  let hi = starts.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans < 0 ? -1 : ids[ans]
}

/** Position within the index of a sentence id (for prev/next navigation). */
export function indexOfId(index: ActiveIndex, id: number): number {
  return index.ids.indexOf(id)
}

/** Number of characters of the sentence spoken by time `t` (binary search on per-char times). */
export function spokenCount(times: Float64Array, t: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Maps a click inside `container` to the code-point index of the character under the pointer. */
export function charIndexFromPoint(container: HTMLElement, chars: string[], x: number, y: number): number | null {
  const doc = container.ownerDocument
  let node: Node | null = null
  let offset = 0
  if (typeof doc.caretPositionFromPoint === 'function') {
    const p = doc.caretPositionFromPoint(x, y)
    if (!p) return null
    node = p.offsetNode
    offset = p.offset
  } else if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(x, y)
    if (!r) return null
    node = r.startContainer
    offset = r.startOffset
  }
  if (!node || !container.contains(node)) return null
  const range = doc.createRange()
  range.setStart(container, 0)
  try {
    range.setEnd(node, offset)
  } catch {
    return null
  }
  const units = range.toString().length
  let acc = 0
  for (let i = 0; i < chars.length; i++) {
    if (acc >= units) return i
    acc += chars[i].length
  }
  return chars.length - 1
}
