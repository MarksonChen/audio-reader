import { create } from 'zustand'
import { useSettings } from './settings'

/** Playback speed: any multiple of 0.05 from 0.05 upward; the browser may refuse extremes. */
export const RATE_MIN = 0.05
export const RATE_STEP = 0.05
export const RATE_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export function snapRate(r: number): number {
  if (!Number.isFinite(r)) return 1
  // Divide by an integer so the stored value prints cleanly (1.15, not 1.1500000000000001).
  return Math.max(RATE_MIN, Math.round(r * 20) / 20)
}

export function fmtRate(r: number): string {
  return `${Number(r.toFixed(2))}×`
}

interface PlayerState {
  el: HTMLAudioElement | null
  currentTime: number
  duration: number
  playing: boolean
  rate: number
  ready: boolean
  /** performance.now() of the last programmatic seek, to tell jumps from natural progression. */
  lastSeekAt: number
  durationHint: number
  /** Set when the browser refused the requested speed; cleared by the UI after reporting it. */
  rateError: string | null
  attach: (el: HTMLAudioElement) => () => void
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (t: number) => void
  skip: (dt: number) => void
  setRate: (r: number) => void
  adjustRate: (delta: number) => void
  /** Trusts a decoded duration over the element's own when they disagree (Safari + Ogg). */
  setDurationHint: (d: number) => void
  clearRateError: () => void
}

export const usePlayer = create<PlayerState>()((set, get) => {
  let raf = 0
  const stopLoop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }
  const startLoop = (el: HTMLAudioElement) => {
    stopLoop()
    const tick = () => {
      set({ currentTime: el.currentTime })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }
  return {
    el: null,
    currentTime: 0,
    duration: 0,
    playing: false,
    rate: 1,
    ready: false,
    lastSeekAt: 0,
    durationHint: 0,
    rateError: null,
    attach: (el) => {
      const onPlay = () => {
        set({ playing: true })
        startLoop(el)
      }
      const onPause = () => {
        stopLoop()
        set({ playing: false, currentTime: el.currentTime })
      }
      const onMeta = () => {
        const hint = get().durationHint
        const own = Number.isFinite(el.duration) ? el.duration : 0
        set({ duration: hint > 0 && Math.abs(own - hint) > 1 ? hint : own, ready: true })
      }
      const onTime = () => {
        if (!get().playing) set({ currentTime: el.currentTime })
      }
      const onRate = () => set({ rate: el.playbackRate })
      el.addEventListener('play', onPlay)
      el.addEventListener('pause', onPause)
      el.addEventListener('ended', onPause)
      el.addEventListener('loadedmetadata', onMeta)
      el.addEventListener('durationchange', onMeta)
      el.addEventListener('timeupdate', onTime)
      el.addEventListener('seeked', onTime)
      el.addEventListener('ratechange', onRate)
      const rate = useSettings.getState().rate || 1
      el.playbackRate = rate
      set({ el, rate, currentTime: el.currentTime, playing: !el.paused, ready: el.readyState >= 1 })
      if (el.readyState >= 1) onMeta()
      return () => {
        stopLoop()
        el.removeEventListener('play', onPlay)
        el.removeEventListener('pause', onPause)
        el.removeEventListener('ended', onPause)
        el.removeEventListener('loadedmetadata', onMeta)
        el.removeEventListener('durationchange', onMeta)
        el.removeEventListener('timeupdate', onTime)
        el.removeEventListener('seeked', onTime)
        el.removeEventListener('ratechange', onRate)
        set({ el: null, playing: false, ready: false, currentTime: 0, duration: 0, durationHint: 0 })
      }
    },
    play: () => {
      void get().el?.play().catch(() => undefined)
    },
    pause: () => get().el?.pause(),
    toggle: () => {
      const { el } = get()
      if (!el) return
      if (el.paused) void el.play().catch(() => undefined)
      else el.pause()
    },
    seek: (t) => {
      const { el, duration } = get()
      if (!el) return
      const max = duration || el.duration || Infinity
      const clamped = Math.max(0, Math.min(Number.isFinite(max) ? max : t, t))
      el.currentTime = clamped
      set({ currentTime: clamped, lastSeekAt: performance.now() })
    },
    skip: (dt) => get().seek(get().currentTime + dt),
    setRate: (raw) => {
      const r = snapRate(raw)
      const { el } = get()
      if (el) {
        try {
          el.playbackRate = r
        } catch {
          set({ rateError: `这个浏览器不支持 ${fmtRate(r)}，可用范围大约是 0.0625× 到 16×。` })
          return
        }
      }
      set({ rate: r })
      useSettings.getState().update({ rate: r })
    },
    adjustRate: (delta) => get().setRate(get().rate + delta),
    setDurationHint: (d) => {
      if (!Number.isFinite(d) || d <= 0) return
      const { el, duration } = get()
      const own = el && Number.isFinite(el.duration) ? el.duration : duration
      set({ durationHint: d, duration: Math.abs(own - d) > 1 ? d : own })
    },
    clearRateError: () => set({ rateError: null }),
  }
})
