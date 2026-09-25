import { Minus, Pause, Play, Plus, RotateCcw, RotateCw, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { fmtTime } from '../lib/format'
import { KEYS, combo } from '../lib/platform'
import { RATE_MIN, RATE_STEP, fmtRate, usePlayer } from '../store/player'

const SLIDER_MIN = 0.25
const SLIDER_MAX = 3
import { Waveform } from './Waveform'

interface Props {
  peaks: Float32Array | null
  slim: boolean
  skipSeconds: number
  onSeek: (t: number) => void
  onPrevSentence: () => void
  onNextSentence: () => void
}

function TimeLabel() {
  const cur = usePlayer((s) => Math.floor(s.currentTime))
  const duration = usePlayer((s) => s.duration)
  return (
    <div className="time">
      <span className="time-cur">{fmtTime(cur)}</span>
      <span className="time-sep">/</span>
      <span className="time-dur">{fmtTime(duration)}</span>
    </div>
  )
}

const blur = (e: MouseEvent<HTMLButtonElement>) => e.currentTarget.blur()

/** Press-and-hold: fires once, then repeats while the pointer stays down. */
function useHold(fn: () => void) {
  const timer = useRef(0)
  const stop = () => {
    window.clearTimeout(timer.current)
    window.clearInterval(timer.current)
    timer.current = 0
  }
  const start = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    fn()
    timer.current = window.setTimeout(() => {
      timer.current = window.setInterval(fn, 70)
    }, 380)
  }
  useEffect(() => stop, [])
  return { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop }
}

/** Speed pill: click for a popover with 0.05 steps, presets and a typed value; wheel over it to nudge. */
function SpeedControl() {
  const rate = usePlayer((s) => s.rate)
  const setRate = usePlayer((s) => s.setRate)
  const adjustRate = usePlayer((s) => s.adjustRate)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const dec = useHold(() => adjustRate(-RATE_STEP))
  const inc = useHold(() => adjustRate(RATE_STEP))
  const popRef = useRef<HTMLDivElement>(null)

  // Centre the popover on the button, but keep it inside the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const el = popRef.current
      if (!el) return
      el.style.translate = '-50% 0'
      const r = el.getBoundingClientRect()
      const margin = 12
      let shift = 0
      if (r.right > window.innerWidth - margin) shift = r.right - (window.innerWidth - margin)
      else if (r.left < margin) shift = r.left - margin
      if (shift) el.style.translate = `calc(-50% - ${shift}px) 0`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  const onWheel = (e: WheelEvent) => {
    if (e.deltaY === 0) return
    adjustRate(e.deltaY < 0 ? RATE_STEP : -RATE_STEP)
  }
  const commitDraft = () => {
    if (draft !== null) {
      const v = parseFloat(draft)
      if (Number.isFinite(v)) setRate(v)
      setDraft(null)
    }
  }

  return (
    <div className="speed">
      <button className={`pill-btn ${open ? 'on' : ''}`} title="播放速度（滚轮微调，[ / ] 键 ±0.05）" onWheel={onWheel} onMouseUp={blur} onClick={() => setOpen((o) => !o)}>
        {fmtRate(rate)}
      </button>
      {open && (
        <>
          <div className="backdrop clear" onClick={() => setOpen(false)} />
          <div ref={popRef} className="speed-pop" role="dialog" aria-label="播放速度" onWheel={onWheel}>
            <div className="speed-row">
              <button className="speed-step" title="−0.05（按住连续）" {...dec}>
                <Minus size={16} />
              </button>
              <label className="speed-value">
                <input
                  type="number"
                  inputMode="decimal"
                  step={RATE_STEP}
                  min={RATE_MIN}
                  value={draft ?? Number(rate.toFixed(2))}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitDraft}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitDraft()
                      ;(e.target as HTMLInputElement).blur()
                    }
                    e.stopPropagation()
                  }}
                />
                <span>×</span>
              </label>
              <button className="speed-step" title="+0.05（按住连续）" {...inc}>
                <Plus size={16} />
              </button>
            </div>
            <input
              className="range speed-slider"
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={RATE_STEP}
              value={Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, rate))}
              style={{ ['--p' as string]: `${((Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, rate)) - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%` }}
              onChange={(e) => setRate(Number(e.target.value))}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="播放速度滑杆"
            />
          </div>
        </>
      )}
    </div>
  )
}

export function Player({ peaks, slim, skipSeconds, onSeek, onPrevSentence, onNextSentence }: Props) {
  const playing = usePlayer((s) => s.playing)
  const ready = usePlayer((s) => s.ready)
  const toggle = usePlayer((s) => s.toggle)
  const skip = usePlayer((s) => s.skip)

  return (
    <div className="player">
      <div className="player-inner">
        <Waveform peaks={peaks} slim={slim} onSeek={onSeek} />
        <div className="controls">
          <div className="ctl-left">
            <TimeLabel />
          </div>
          <div className="ctl-center">
            <button className="icon-btn" title={`上一句 (${combo(KEYS.alt, '←')})`} onMouseUp={blur} onClick={onPrevSentence}>
              <SkipBack size={18} />
            </button>
            <button className="icon-btn skip" title={`后退 ${skipSeconds} 秒 (←)`} onMouseUp={blur} onClick={() => skip(-skipSeconds)}>
              <RotateCcw size={22} />
              <span>{skipSeconds}</span>
            </button>
            <button className="play" title={playing ? '暂停 (空格)' : '播放 (空格)'} disabled={!ready} onMouseUp={blur} onClick={toggle}>
              {playing ? <Pause size={24} fill="currentColor" strokeWidth={0} /> : <Play size={24} fill="currentColor" strokeWidth={0} className="play-icon" />}
            </button>
            <button className="icon-btn skip" title={`前进 ${skipSeconds} 秒 (→)`} onMouseUp={blur} onClick={() => skip(skipSeconds)}>
              <RotateCw size={22} />
              <span>{skipSeconds}</span>
            </button>
            <button className="icon-btn" title={`下一句 (${combo(KEYS.alt, '→')})`} onMouseUp={blur} onClick={onNextSentence}>
              <SkipForward size={18} />
            </button>
          </div>
          <div className="ctl-right">
            <SpeedControl />
          </div>
        </div>
      </div>
    </div>
  )
}
