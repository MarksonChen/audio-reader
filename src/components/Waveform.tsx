import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { fmtTime } from '../lib/format'
import { usePlayer } from '../store/player'
import { useSettings } from '../store/settings'

interface Colours {
  muted: string
  accent: string
  fg: string
}

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
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Subscribe to the progress bar index rather than the raw clock: the canvas only changes when
  // the coloured edge moves by a bar, not 60 times a second.
  const barCount = Math.max(1, Math.floor((size.w + GAP) / (BAR + GAP)))
  const progressBars = usePlayer((s) => (s.duration > 0 ? Math.min(barCount, Math.floor((s.currentTime / s.duration) * barCount)) : 0))
  // Colours are read from CSS variables, which change with theme or accent.
  const accent = useSettings((s) => s.accent)
  const theme = useSettings((s) => s.theme)
  const customAccent = useSettings((s) => s.customAccent)
  const colours = useRef<Colours | null>(null)
  useEffect(() => {
    colours.current = null
  }, [accent, theme, customAccent])
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
    if (!colours.current) {
      const cs = getComputedStyle(wrap)
      colours.current = {
        muted: cs.getPropertyValue('--wave').trim() || '#999',
        accent: cs.getPropertyValue('--accent').trim() || '#c8551f',
        fg: cs.getPropertyValue('--fg').trim() || '#000',
      }
    }
    const { muted, accent: accentColour, fg } = colours.current
    const { w, h } = size
    const count = barCount
    const mid = h / 2
    if (peaks && peaks.length) {
      for (let i = 0; i < count; i++) {
        // Average every peak bin that falls inside this bar, so resizing does not make bars jitter.
        const a = Math.floor((i / count) * peaks.length)
        const b = Math.max(a + 1, Math.floor(((i + 1) / count) * peaks.length))
        let sum = 0
        for (let j = a; j < b; j++) sum += peaks[j]
        const bh = Math.max(2, (sum / (b - a)) * (h - 6))
        const x = i * (BAR + GAP)
        ctx.fillStyle = i < progressBars ? accentColour : muted
        ctx.beginPath()
        ctx.roundRect(x, mid - bh / 2, BAR, bh, 1)
        ctx.fill()
      }
    } else {
      ctx.fillStyle = muted
      ctx.fillRect(0, mid - 1, w, 2)
      ctx.fillStyle = accentColour
      ctx.fillRect(0, mid - 1, (w * progressBars) / count, 2)
    }
    if (hover != null) {
      ctx.fillStyle = fg
      ctx.globalAlpha = 0.35
      ctx.fillRect(Math.round(hover * w), 2, 1, h - 4)
      ctx.globalAlpha = 1
    }
  }, [peaks, size, barCount, progressBars, hover, accent, theme, customAccent])

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
