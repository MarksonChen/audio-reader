import { create } from 'zustand'

export const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')

export interface Anomaly {
  at: string
  char: string
  delta: number
  tops: number[]
  lefts: number[]
  heights: number[]
  scrollTop: number
}

interface DebugState {
  frames: number
  maxDelta: number
  anomalies: Anomaly[]
  record: (a: Omit<Anomaly, 'at'>) => void
}

export const useDebug = create<DebugState>()((set) => ({
  frames: 0,
  maxDelta: 0,
  anomalies: [],
  record: (a) =>
    set((st) => {
      const isAnomaly = a.delta > 0.3 && a.delta < 20
      return {
        frames: st.frames + 1,
        maxDelta: Math.max(st.maxDelta, a.delta < 20 ? a.delta : st.maxDelta),
        anomalies: isAnomaly ? [{ ...a, at: new Date().toLocaleTimeString() }, ...st.anomalies].slice(0, 12) : st.anomalies,
      }
    }),
}))

/** Compares the glyph boxes of the current character and its neighbours (same line only). */
export function measureKaraoke(container: HTMLElement, cur: number): void {
  const spans = container.children
  if (cur < 0 || cur >= spans.length) return
  const idx = [cur - 1, cur, cur + 1].filter((j) => j >= 0 && j < spans.length)
  const rects = idx.map((j) => spans[j].getBoundingClientRect())
  const tops = rects.map((r) => Math.round(r.top * 100) / 100)
  const lefts = rects.map((r) => Math.round(r.left * 100) / 100)
  const heights = rects.map((r) => Math.round(r.height * 100) / 100)
  const delta = Math.max(...tops) - Math.min(...tops)
  const scroller = container.closest('.scroll')
  useDebug.getState().record({
    char: spans[cur].textContent ?? '',
    delta: Math.round(delta * 100) / 100,
    tops,
    lefts,
    heights,
    scrollTop: scroller ? Math.round(scroller.scrollTop * 100) / 100 : -1,
  })
}
