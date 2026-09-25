import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { fmtTime } from '../lib/format'
import { usePlayer } from '../store/player'
import { useSettings } from '../store/settings'

interface Props {
  peaks: Float32Array | null
  slim?: boolean
  onSeek: (t: number) => void
}

const BAR = 2
const GAP = 2

export function Waveform({ peaks, slim = false, onSeek }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const duration = usePlayer((s) => s.duration)
  const currentTime = usePlayer((s) => s.currentTime)
  // Colours are read from CSS variables at draw time, so redraw when theme or accent change.
  const accent = useSettings((s) => s.accent)
  const theme = useSettings((s) => s.theme)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<number | null>(null)
  const dragging = useRef(false)
  const lastSeek = useRef(0)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !size.w || !size.h) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== size.w * dpr || canvas.height !== size.h * dpr) {
      canvas.width = size.w * dpr
      canvas.height = size.h * dpr
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    const cs = getComputedStyle(wrap)
    const muted = cs.getPropertyValue('--wave').trim() || '#999'
    const accent = cs.getPropertyValue('--accent').trim() || '#c8551f'
    const fg = cs.getPropertyValue('--fg').trim() || '#000'
    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0
    const { w, h } = size
    const count = Math.max(1, Math.floor((w + GAP) / (BAR + GAP)))
    const mid = h / 2
    if (peaks && peaks.length) {
      for (let i = 0; i < count; i++) {
        const c = Math.floor(((i + 0.5) / count) * peaks.length)
        const a = Math.max(0, c - 1)
        const b = Math.min(peaks.length, c + 2)
        let sum = 0
        for (let j = a; j < b; j++) sum += peaks[j]
        const bh = Math.max(2, (sum / (b - a)) * (h - 6))
        const x = i * (BAR + GAP)
        ctx.fillStyle = (i + 0.5) / count <= progress ? accent : muted
        ctx.beginPath()
        ctx.roundRect(x, mid - bh / 2, BAR, bh, 1)
        ctx.fill()
      }
    } else {
      ctx.fillStyle = muted
      ctx.fillRect(0, mid - 1, w, 2)
      ctx.fillStyle = accent
      ctx.fillRect(0, mid - 1, w * progress, 2)
    }
    if (hover != null) {
      ctx.fillStyle = fg
      ctx.globalAlpha = 0.35
      ctx.fillRect(Math.round(hover * w), 2, 1, h - 4)
      ctx.globalAlpha = 1
    }
  }, [peaks, size, duration, currentTime, hover, accent, theme])

  const fracFromEvent = (e: PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }
  const seekTo = (frac: number, force: boolean) => {
    const now = performance.now()
    if (!force && now - lastSeek.current < 60) return
    lastSeek.current = now
    if (duration > 0) onSeek(frac * duration)
  }

  return (
    <div
      ref={wrapRef}
      className={`wave ${peaks ? '' : 'wave-empty'} ${slim ? 'slim' : ''}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
        const f = fracFromEvent(e)
        setHover(f)
        seekTo(f, true)
      }}
      onPointerMove={(e) => {
        const f = fracFromEvent(e)
        setHover(f)
        if (dragging.current) seekTo(f, false)
      }}
      onPointerUp={(e) => {
        if (dragging.current) seekTo(fracFromEvent(e), true)
        dragging.current = false
      }}
      onPointerLeave={() => {
        if (!dragging.current) setHover(null)
      }}
      onPointerCancel={() => {
        dragging.current = false
        setHover(null)
      }}
    >
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} />
      {hover != null && duration > 0 && (
        <div className="wave-tip" style={{ left: `${hover * 100}%` }}>
          {fmtTime(hover * duration)}
        </div>
      )}
    </div>
  )
}
