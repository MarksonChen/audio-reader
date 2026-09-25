import { memo, useLayoutEffect, useRef, type MouseEvent } from 'react'
import { charIndexFromPoint, spokenCount } from '../lib/active'
import { DEBUG, measureKaraoke } from '../lib/debug'
import type { Sentence } from '../lib/types'
import { usePlayer } from '../store/player'
import { useSettings } from '../store/settings'

export type SentenceState = 'past' | 'active' | 'future'

interface Props {
  s: Sentence
  state: SentenceState
  onSeek: (t: number) => void
}

function useSeekClick(s: Sentence, onSeek: (t: number) => void) {
  const ref = useRef<HTMLSpanElement>(null)
  const onClick = (e: MouseEvent<HTMLSpanElement>) => {
    const el = ref.current
    if (!el) return onSeek(s.start)
    const idx = charIndexFromPoint(el, s.chars, e.clientX, e.clientY)
    const t = idx != null && s.synced ? s.times[idx] : s.start
    onSeek(Number.isFinite(t) ? t : s.start)
  }
  return { ref, onClick }
}

/**
 * Active sentence. Every character sits in its own span for as long as the sentence is
 * active, so between frames nothing in the DOM text changes: only class names and one
 * inline colour. Characters already spoken are accent-coloured, the one being spoken
 * fades from the text colour to the accent over its own duration.
 */
function KaraokeSentence({ s, onSeek }: { s: Sentence; onSeek: (t: number) => void }) {
  const offset = useSettings((st) => st.offset)
  const t = usePlayer((p) => p.currentTime) + offset
  const { ref, onClick } = useSeekClick(s, onSeek)
  const n = s.chars.length
  const k = spokenCount(s.times, t)
  const cur = k - 1
  let frac = 0
  if (k > 0) {
    const a = s.times[cur]
    const b = k < n ? s.times[k] : Math.max(s.end, a + 0.15)
    frac = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 1
  }
  const mix = `color-mix(in oklab, var(--accent) ${Math.round(frac * 100)}%, var(--fg))`

  useLayoutEffect(() => {
    if (DEBUG && ref.current) measureKaraoke(ref.current, cur)
  })

  return (
    <span ref={ref} className="sent active karaoke" data-sid={s.id} onClick={onClick}>
      {s.chars.map((ch, j) => (
        <span key={j} className={j < cur ? 'ch on' : j === cur ? 'ch cur' : 'ch'} style={j === cur ? { color: mix } : undefined}>
          {ch}
        </span>
      ))}
    </span>
  )
}

function PlainSentence({ s, state, onSeek }: Props) {
  const { ref, onClick } = useSeekClick(s, onSeek)
  return (
    <span ref={ref} className={`sent ${state}${s.synced ? '' : ' unsynced'}`} data-sid={s.id} onClick={onClick}>
      {s.text}
    </span>
  )
}

export const SentenceView = memo(function SentenceView({ s, state, onSeek }: Props) {
  if (state === 'active' && s.synced) return <KaraokeSentence s={s} onSeek={onSeek} />
  return <PlainSentence s={s} state={state} onSeek={onSeek} />
})
