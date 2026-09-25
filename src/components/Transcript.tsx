import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { fmtTime } from '../lib/format'
import { fontById } from '../lib/fonts'
import type { AlignedDoc, Paragraph, Sentence } from '../lib/types'
import { ANCHOR_FRACTION, useSettings } from '../store/settings'
import { SentenceView, type SentenceState } from './SentenceView'

interface ParagraphProps {
  p: Paragraph
  sentences: Sentence[]
  activeId: number
  state: SentenceState
  showTs: boolean
  onSeek: (t: number) => void
}

const ParagraphView = memo(function ParagraphView({ p, sentences, activeId, state, showTs, onSeek }: ParagraphProps) {
  const Tag = p.kind === 'heading' ? (p.level <= 1 ? 'h2' : 'h3') : 'p'
  return (
    <Tag className={`para ${state}`} data-pid={p.id}>
      {showTs && (
        <button className="ts" tabIndex={-1} onClick={() => onSeek(p.start)} title="跳到这一段">
          {fmtTime(p.start)}
        </button>
      )}
      {sentences.map((s) => (
        <SentenceView
          key={s.id}
          s={s}
          state={state !== 'active' ? state : s.id === activeId ? 'active' : s.id < activeId ? 'past' : 'future'}
          onSeek={onSeek}
        />
      ))}
    </Tag>
  )
})

interface Props {
  doc: AlignedDoc
  activeId: number
  follow: boolean
  /** Called after a user scroll; `away` is true when the view left the followed position by more than a line. */
  onUserScroll: (away: boolean) => void
  onSeek: (t: number) => void
}

export function Transcript({ doc, activeId, follow, onUserScroll, onSeek }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const programmaticUntil = useRef(0)
  const activeRef = useRef(activeId)
  useLayoutEffect(() => {
    activeRef.current = activeId
  }, [activeId])

  const showTs = useSettings((s) => s.showTimestamps)
  const dimOthers = useSettings((s) => s.dimOthers)
  const dimPast = useSettings((s) => s.dimPast)
  const highlightStyle = useSettings((s) => s.highlightStyle)
  const font = useSettings((s) => s.font)
  const fontSize = useSettings((s) => s.fontSize)
  const lineHeight = useSettings((s) => s.lineHeight)
  const measure = useSettings((s) => s.measure)
  const justify = useSettings((s) => s.justify)
  const indent = useSettings((s) => s.indent)
  const followAnchor = useSettings((s) => s.followAnchor)
  const followUnit = useSettings((s) => s.followUnit)
  const smoothScroll = useSettings((s) => s.smoothScroll)

  const slices = useMemo(() => doc.paragraphs.map((p) => doc.sentences.slice(p.from, p.to)), [doc])
  const activePid = activeId >= 0 ? doc.sentences[activeId]?.para ?? -1 : -1
  // With paragraph-level following the view only moves when the paragraph changes.
  const followKey = followUnit === 'paragraph' ? activePid : activeId

  /** Scroll position that would put the followed element at its anchor, plus that element's line height. */
  const followTarget = useCallback(
    (c: HTMLDivElement): { top: number; line: number } | null => {
      const id = activeRef.current
      if (id < 0) return null
      const sentence = c.querySelector<HTMLElement>(`[data-sid="${id}"]`)
      if (!sentence) return null
      const el = followUnit === 'paragraph' ? (sentence.closest<HTMLElement>('.para') ?? sentence) : sentence
      const cRect = c.getBoundingClientRect()
      const eRect = el.getBoundingClientRect()
      const top = Math.max(0, c.scrollTop + (eRect.top - cRect.top) - c.clientHeight * ANCHOR_FRACTION[followAnchor])
      const line = parseFloat(getComputedStyle(el).lineHeight) || 32
      return { top, line }
    },
    [followUnit, followAnchor],
  )

  const scrollToActive = useCallback(
    (behavior: ScrollBehavior) => {
      const c = ref.current
      if (!c) return
      const t = followTarget(c)
      if (!t) return
      const dist = Math.abs(t.top - c.scrollTop)
      if (dist < 2) return
      const mode: ScrollBehavior = behavior === 'smooth' && dist <= c.clientHeight * 2.5 ? 'smooth' : 'instant'
      programmaticUntil.current = performance.now() + (mode === 'smooth' ? 2000 : 300)
      c.scrollTo({ top: t.top, behavior: mode })
    },
    [followTarget],
  )

  useEffect(() => {
    if (follow) scrollToActive(smoothScroll ? 'smooth' : 'instant')
  }, [followKey, follow, scrollToActive, smoothScroll, fontSize, font, lineHeight, measure])

  // User scrolling: only counts as "leaving" when the view drifts more than one line away from
  // the followed position, so small nudges neither stop following nor raise the pill.
  useEffect(() => {
    const c = ref.current
    if (!c) return
    let lastInput = 0
    const markInput = () => {
      lastInput = performance.now()
    }
    const onKey = (e: KeyboardEvent) => {
      if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key)) markInput()
    }
    const onScroll = () => {
      const now = performance.now()
      const userCaused = now - lastInput < 400 || now > programmaticUntil.current
      if (!userCaused) return
      const t = followTarget(c)
      if (!t) return
      onUserScroll(Math.abs(c.scrollTop - t.top) > t.line)
    }
    c.addEventListener('wheel', markInput, { passive: true })
    c.addEventListener('touchmove', markInput, { passive: true })
    c.addEventListener('pointerdown', markInput, { passive: true })
    window.addEventListener('keydown', onKey)
    c.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      c.removeEventListener('wheel', markInput)
      c.removeEventListener('touchmove', markInput)
      c.removeEventListener('pointerdown', markInput)
      window.removeEventListener('keydown', onKey)
      c.removeEventListener('scroll', onScroll)
    }
  }, [onUserScroll, followTarget])

  const docClass = [
    'doc',
    `hl-${highlightStyle}`,
    justify ? 'justify' : 'left',
    measure > 0 ? '' : 'full',
    indent ? 'indent' : '',
    dimPast ? 'dim-past' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const docStyle = {
    '--font-read': fontById(font).stack,
    '--fs': `${fontSize}px`,
    '--lh': String(lineHeight),
    '--measure': measure > 0 ? `${measure}rem` : 'none',
  } as CSSProperties

  return (
    <div ref={ref} className={`scroll ${dimOthers ? 'dim' : ''}`}>
      <article className={docClass} style={docStyle}>
        {doc.paragraphs.map((p, i) => (
          <ParagraphView
            key={p.id}
            p={p}
            sentences={slices[i]}
            activeId={activeId >= p.from && activeId < p.to ? activeId : -1}
            state={activeId < 0 ? 'future' : activeId >= p.to ? 'past' : activeId >= p.from ? 'active' : 'future'}
            showTs={showTs}
            onSeek={onSeek}
          />
        ))}
        <div className="doc-end">— 完 —</div>
      </article>
    </div>
  )
}
