import { ArrowLeft, Keyboard, LocateFixed, Maximize2, Minimize2, Search, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMediaSession } from '../hooks/useMediaSession'
import { DEBUG } from '../lib/debug'
import { buildActiveIndex, findActive, indexOfId } from '../lib/active'
import { fmtTime } from '../lib/format'
import { KEYS, combo } from '../lib/platform'
import { RATE_STEP, fmtRate, usePlayer } from '../store/player'
import { useFlags } from '../store/flags'
import { useSession } from '../store/session'
import { FONT_SIZE_RANGE, useSettings } from '../store/settings'
import { AppearancePicker, type PickerTab } from './AppearancePicker'
import { DebugOverlay } from './DebugOverlay'
import { Player } from './Player'
import { SearchPanel } from './SearchPanel'
import { SettingsPanel } from './SettingsPanel'
import { ShortcutsHelp } from './ShortcutsHelp'
import { Transcript } from './Transcript'

type Panel = 'none' | 'settings' | 'help' | 'search' | PickerTab


export function Reader() {
  const session = useSession((s) => s.session)
  const doc = useSession((s) => s.doc)
  const audioUrl = useSession((s) => s.audioUrl)
  const peaks = useSession((s) => s.peaks)
  const close = useSession((s) => s.close)
  const savePosition = useSession((s) => s.savePosition)
  const showToast = useSession((s) => s.showToast)
  const autoFollow = useSettings((s) => s.autoFollow)
  const offset = useSettings((s) => s.offset)
  const skipSeconds = useSettings((s) => s.skipSeconds)
  const sentenceEnd = useSettings((s) => s.sentenceEnd)
  const playOnClick = useSettings((s) => s.playOnClick)
  const showWave = useSettings((s) => s.showWave)

  const activeDoc = doc
  const index = useMemo(() => buildActiveIndex(activeDoc), [activeDoc])
  const activeId = usePlayer((p) => findActive(index, p.currentTime + offset))
  // Navigation callbacks read the current sentence through a ref so the key listener is registered once.
  const activeIdRef = useRef(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const audioRef = useRef<HTMLAudioElement>(null)
  const attach = usePlayer((p) => p.attach)
  const seek = usePlayer((p) => p.seek)
  const ready = usePlayer((p) => p.ready)

  const [follow, setFollow] = useState(autoFollow)
  const [panel, setPanel] = useState<Panel>('none')
  const [immersive, setImmersive] = useState(false)

  // Immersive reading: hide the header and the player bar; the browser window itself is left alone.
  const toggleImmersive = useCallback(() => {
    setImmersive((cur) => !cur)
    setPanel('none')
  }, [])

  useEffect(() => {
    document.documentElement.toggleAttribute('data-immersive', immersive)
    return () => document.documentElement.removeAttribute('data-immersive')
  }, [immersive])
  const onUserScroll = useCallback((away: boolean) => setFollow(!away), [])
  const seekAndFollow = useCallback(
    (t: number) => {
      seek(t)
      setFollow(true)
    },
    [seek],
  )
  // Clicking text: jump, follow, and (optionally) start playing.
  const seekFromText = useCallback(
    (t: number) => {
      seekAndFollow(t)
      if (playOnClick) usePlayer.getState().play()
    },
    [seekAndFollow, playOnClick],
  )

  // Sentence-end behaviour: pause at the boundary, or repeat the sentence that just ended.
  const prevActive = useRef(activeId)
  useEffect(() => {
    const prev = prevActive.current
    prevActive.current = activeId
    if (sentenceEnd === 'continue' || prev < 0 || activeId === prev) return
    const p = usePlayer.getState()
    if (!p.playing || performance.now() - p.lastSeekAt < 400) return
    if (sentenceEnd === 'pause') {
      p.pause()
      return
    }
    const pos = indexOfId(index, prev)
    if (pos >= 0) p.seek(Math.max(0, index.starts[pos] - offset + 0.01))
  }, [activeId, sentenceEnd, index, offset])

  useMediaSession(session?.title)

  // Count listening time (only while playing); after a minute the demo button goes away for good.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (usePlayer.getState().playing && !useFlags.getState().demoDismissed) useFlags.getState().addListened(1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const rateError = usePlayer((p) => p.rateError)
  useEffect(() => {
    if (!rateError) return
    showToast(rateError)
    usePlayer.getState().clearRateError()
  }, [rateError, showToast])

  // The browser tab shows what is being read.
  useEffect(() => {
    if (!session) return
    const previous = document.title
    document.title = session.title
    return () => {
      document.title = previous
    }
  }, [session])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    return attach(el)
  }, [attach, audioUrl])

  const restored = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || !session || restored.current === session.id) return
    restored.current = session.id
    const dur = audioRef.current?.duration ?? 0
    if (session.position > 5 && (!dur || session.position < dur - 5)) {
      seek(session.position)
      showToast(`从 ${fmtTime(session.position)} 继续`)
    }
    if (dur) void savePosition(audioRef.current?.currentTime ?? 0, dur)
  }, [ready, session, seek, showToast, savePosition])

  useEffect(() => {
    // Read the element itself: the store clock may lag while the tab is hidden.
    const save = () => {
      const p = usePlayer.getState()
      if (p.el && p.duration) savePosition(p.el.currentTime, p.duration)
    }
    const timer = window.setInterval(save, 5000)
    const onVisibility = () => document.visibilityState === 'hidden' && save()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', save)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', save)
    }
  }, [savePosition])

  const goSentence = useCallback(
    (dir: -1 | 1) => {
      if (!index.starts.length) return
      const pos = indexOfId(index, activeIdRef.current)
      const cur = usePlayer.getState().currentTime + offset
      let next: number
      if (dir < 0) {
        const curStart = pos >= 0 ? index.starts[pos] : 0
        next = pos >= 0 && cur - curStart > 1.5 ? pos : Math.max(0, pos - 1)
      } else {
        next = Math.min(index.starts.length - 1, pos + 1)
      }
      seekAndFollow(Math.max(0, index.starts[next] - offset + 0.02))
    },
    [index, offset, seekAndFollow],
  )

  // Paragraph navigation: ⌥↑ goes to the start of this paragraph (or the previous one when
  // already at its start), ⌥↓ to the next paragraph.
  const goParagraph = useCallback(
    (dir: -1 | 1) => {
      const d = activeDoc
      if (!d || !d.paragraphs.length) return
      const cur = usePlayer.getState().currentTime + offset
      const activeNow = activeIdRef.current
      const curPid = activeNow >= 0 ? d.sentences[activeNow].para : -1
      const hasText = (pid: number) => d.paragraphs[pid] && d.paragraphs[pid].to > d.paragraphs[pid].from
      let target = -1
      if (dir > 0) {
        for (let pid = curPid + 1; pid < d.paragraphs.length; pid++) {
          if (hasText(pid)) {
            target = pid
            break
          }
        }
      } else {
        const start = curPid >= 0 ? d.paragraphs[curPid].start : 0
        if (curPid >= 0 && cur - start > 1.5) target = curPid
        else {
          for (let pid = curPid - 1; pid >= 0; pid--) {
            if (hasText(pid)) {
              target = pid
              break
            }
          }
        }
        if (target < 0 && curPid >= 0) target = curPid
      }
      if (target < 0) return
      seekAndFollow(Math.max(0, d.paragraphs[target].start - offset + 0.02))
    },
    [activeDoc, offset, seekAndFollow],
  )

  // Touch gestures on the reading area: swipe left/right to skip, double-tap to play/pause,
  // swipe up from the player bar to open the settings.
  useEffect(() => {
    let start: { x: number; y: number; t: number; onPlayer: boolean } | null = null
    let lastTap = 0
    let lastTapX = 0
    let lastTapY = 0
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start = null
        return
      }
      const t = e.touches[0]
      const target = e.target as HTMLElement | null
      // Sliders, popups and inputs have their own touch behaviour.
      if (target?.closest('.panel, .speed-pop, input, textarea, .immersive-exit')) {
        start = null
        return
      }
      start = { x: t.clientX, y: t.clientY, t: performance.now(), onPlayer: !!target?.closest('.player') }
    }
    const onEnd = (e: TouchEvent) => {
      if (!start || e.changedTouches.length !== 1) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const dt = performance.now() - start.t
      const target = e.target as HTMLElement | null
      const p = usePlayer.getState()
      if (start.onPlayer && dt < 500 && dy < -60 && Math.abs(dx) < 50) {
        setPanel('settings')
      } else if (!start.onPlayer && dt < 500 && Math.abs(dx) > 70 && Math.abs(dy) < 45) {
        const step = dx < 0 ? skipSeconds : -skipSeconds
        p.skip(step)
        setFollow(true)
        showToast(`${step > 0 ? '+' : '−'}${Math.abs(step)} 秒`)
      } else if (!start.onPlayer && dt < 250 && Math.abs(dx) < 10 && Math.abs(dy) < 10 && !target?.closest('button, input, .panel, .immersive-exit')) {
        const now = performance.now()
        if (now - lastTap < 320 && Math.abs(t.clientX - lastTapX) < 30 && Math.abs(t.clientY - lastTapY) < 30) {
          p.toggle()
          lastTap = 0
        } else {
          lastTap = now
          lastTapX = t.clientX
          lastTapY = t.clientY
        }
      }
      start = null
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [skipSeconds, showToast])

  const leave = useCallback(async () => {
    const p = usePlayer.getState()
    p.pause()
    if (p.el && p.duration) await savePosition(p.el.currentTime, p.duration)
    close()
  }, [savePosition, close])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey) {
        if (e.key === ',') {
          e.preventDefault()
          setPanel((p) => (p === 'settings' ? 'none' : 'settings'))
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault()
          setPanel('search')
        }
        return
      }
      const p = usePlayer.getState()
      // Holding a key repeats only the seek and size/speed steps, not the toggles.
      if (e.repeat && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '-', '=', '+', '[', ']', '{', '}'].includes(e.key)) return
      switch (e.key) {
        case ' ':
          if (tag === 'BUTTON') return
          e.preventDefault()
          p.toggle()
          break
        case 'k':
        case 'K':
          p.toggle()
          break
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault()
          const dir = e.key === 'ArrowLeft' ? -1 : 1
          if (e.altKey) goSentence(dir)
          else {
            const fine = skipSeconds <= 5 ? 1 : 5
            p.skip(dir * (e.shiftKey ? fine : skipSeconds))
            setFollow(true)
          }
          break
        }
        case '-':
        case '=':
        case '+': {
          const st = useSettings.getState()
          const next = Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, st.fontSize + (e.key === '-' ? -1 : 1)))
          st.update({ fontSize: next })
          showToast(`字号 ${next}px`)
          break
        }
        case '[':
        case ']':
        case '{':
        case '}': {
          const step = e.shiftKey ? 0.25 : RATE_STEP
          p.adjustRate(e.key === '[' || e.key === '{' ? -step : step)
          showToast(`${fmtRate(usePlayer.getState().rate)} 速度`)
          break
        }
        case 'f':
        case 'F':
          setFollow((f) => !f)
          break
        case 'z':
        case 'Z':
          toggleImmersive()
          break
        case '/':
          e.preventDefault()
          setPanel('search')
          break
        case 'ArrowUp':
        case 'ArrowDown':
          if (!e.altKey) return
          e.preventDefault()
          goParagraph(e.key === 'ArrowUp' ? -1 : 1)
          break
        case 'Enter':
          setFollow(true)
          break
        case '?':
          setPanel((cur) => (cur === 'help' ? 'none' : 'help'))
          break
        case 'Escape':
          setPanel('none')
          setImmersive(false)
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goSentence, goParagraph, showToast, skipSeconds, toggleImmersive])

  if (!session || !activeDoc) return null

  return (
    <div className={`reader ${immersive ? 'immersive' : ''}`}>
      <audio ref={audioRef} src={audioUrl ?? undefined} preload="metadata" />
      {immersive && (
        <button className="immersive-exit" onClick={toggleImmersive} title="退出专注阅读 (Z / Esc)">
          <Minimize2 size={16} />
        </button>
      )}
      <header className="hdr">
        <button className="icon-btn" onClick={() => void leave()} title="返回">
          <ArrowLeft size={18} />
        </button>
        <div className="hdr-title">
          <h1 title={session.title}>{session.title}</h1>
        </div>
        <button className={`icon-btn ${panel === 'search' ? 'on' : ''}`} onClick={() => setPanel((p) => (p === 'search' ? 'none' : 'search'))} title={`搜索 (${combo(KEYS.mod, 'F')} 或 /)`}>
          <Search size={18} />
        </button>
        <button
          className={`icon-btn ${panel === 'settings' || panel === 'accent' || panel === 'font' ? 'on' : ''}`}
          onClick={() => setPanel((p) => (p === 'none' || p === 'help' ? 'settings' : 'none'))}
          title={`阅读设置 (${combo(KEYS.mod, ',')})`}
        >
          <SlidersHorizontal size={18} />
        </button>
        <button className={`icon-btn ${panel === 'help' ? 'on' : ''}`} onClick={() => setPanel((p) => (p === 'help' ? 'none' : 'help'))} title="快捷键 (?)">
          <Keyboard size={18} />
        </button>
        <button className="icon-btn" onClick={toggleImmersive} title="专注阅读，隐藏上下栏 (Z)">
          <Maximize2 size={18} />
        </button>
      </header>

      <Transcript doc={activeDoc} activeId={activeId} follow={follow} onUserScroll={onUserScroll} onSeek={seekFromText} />

      {!follow && activeId >= 0 && (
        <button className="follow-pill" onClick={() => setFollow(true)}>
          <LocateFixed size={15} />
          回到当前句
        </button>
      )}

      <Player
        peaks={showWave ? peaks : null}
        slim={!showWave}
        skipSeconds={skipSeconds}
        onSeek={seekAndFollow}
        onPrevSentence={() => goSentence(-1)}
        onNextSentence={() => goSentence(1)}
      />

      {DEBUG && <DebugOverlay />}
      {panel === 'settings' && <SettingsPanel onClose={() => setPanel('none')} onPick={(tab) => setPanel(tab)} />}
      {(panel === 'accent' || panel === 'font') && (
        <AppearancePicker tab={panel} onTab={(tab) => setPanel(tab)} onBack={() => setPanel('settings')} onClose={() => setPanel('none')} />
      )}
      {panel === 'help' && <ShortcutsHelp skipSeconds={skipSeconds} onClose={() => setPanel('none')} />}
      {panel === 'search' && (
        <SearchPanel doc={activeDoc} onJump={(s) => seekAndFollow(Math.max(0, s.start - offset + 0.02))} onClose={() => setPanel('none')} />
      )}
    </div>
  )
}
