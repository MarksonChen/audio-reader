import { memo, useLayoutEffect, useRef, type MouseEvent } from 'react'
import { charIndexFromPoint, findCue, spokenCount } from '../lib/active'
import { DEBUG, measureKaraoke } from '../lib/debug'
import type { Sentence } from '../lib/types'
import { usePlayer } from '../store/player'
import { useSettings } from '../store/settings'

export type SentenceState = 'past' | 'active' | 'future'

interface Props {
  s: Sentence
  state: SentenceState
  /** Cue start times: present when the subtitle is not word-level, so colouring steps per cue. */
  blockCues?: Float64Array
  onSeek: (t: number) => void
}

function useSeekClick(s: Sentence, onSeek: (t: number) => void, blockCues?: Float64Array) {
  const ref = useRef<HTMLSpanElement>(null)
  const onClick = (e: MouseEvent<HTMLSpanElement>) => {
    const el = ref.current
    if (!el) return onSeek(s.start)
    const idx = charIndexFromPoint(el, s.chars, e.clientX, e.clientY)
    if (idx == null || !s.synced) return onSeek(s.start)
    // Without word-level timing the honest target is the start of the cue that contains the character.
    if (blockCues) {
      const cue = s.cues[idx]
      const t = cue >= 0 && cue < blockCues.length ? blockCues[cue] : s.times[idx]
      return onSeek(Number.isFinite(t) ? t : s.start)
    }
    const t = s.times[idx]
    onSeek(Number.isFinite(t) ? t : s.start)
  }
  return { ref, onClick }
}

/**
 * Active sentence. Every character sits in its own span for as long as the sentence is
 * active, so between frames nothing in the DOM text changes: only class names and one
 * inline colour. With word-level timing, characters already spoken are accent-coloured and
 * the one being spoken fades in over its own duration. With ordinary subtitles the colour
 * advances one cue block at a time, because that is all the timing that is really known.
 */
function KaraokeSentence({ s, blockCues, onSeek }: { s: Sentence; blockCues?: Float64Array; onSeek: (t: number) => void }) {
  const offset = useSettings((st) => st.offset)
  const t = usePlayer((p) => p.currentTime) + offset
  const { ref, onClick } = useSeekClick(s, onSeek, blockCues)
  const n = s.chars.length
  let cur = -1
  let frac = 0
  let currentCue = -1
  if (blockCues) {
    currentCue = findCue(blockCues, t)
  } else {
    const k = spokenCount(s.times, t)
    cur = k - 1
    if (k > 0) {
      const a = s.times[cur]
      const b = k < n ? s.times[k] : Math.max(s.end, a + 0.15)
      frac = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 1
    }
  }
  const mix = `color-mix(in oklab, var(--accent) ${Math.round(frac * 100)}%, var(--fg))`

  useLayoutEffect(() => {
    if (DEBUG && ref.current && cur >= 0) measureKaraoke(ref.current, cur)
  })

  return (
    <span ref={ref} className="sent active karaoke" data-sid={s.id} onClick={onClick}>
      {s.chars.map((ch, j) => {
        const on = blockCues ? s.cues[j] <= currentCue : j < cur
        const isCur = !blockCues && j === cur
        return (
          <span key={j} className={on ? 'ch on' : isCur ? 'ch cur' : 'ch'} style={isCur ? { color: mix } : undefined}>
            {ch}
          </span>
        )
      })}
    </span>
  )
}

function PlainSentence({ s, state, blockCues, onSeek }: Props) {
  const { ref, onClick } = useSeekClick(s, onSeek, blockCues)
  return (
    <span ref={ref} className={`sent ${state}${s.synced ? '' : ' unsynced'}`} data-sid={s.id} onClick={onClick}>
      {s.text}
    </span>
  )
}

export const SentenceView = memo(function SentenceView({ s, state, blockCues, onSeek }: Props) {
  if (state === 'active' && s.synced) return <KaraokeSentence s={s} blockCues={blockCues} onSeek={onSeek} />
  return <PlainSentence s={s} state={state} blockCues={blockCues} onSeek={onSeek} />
})
