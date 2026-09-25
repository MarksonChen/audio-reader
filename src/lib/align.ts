import DiffMatchPatch from 'diff-match-patch'
import { isContentChar, normalizeChars } from './normalize'
import { segmentTranscript, type Segmented } from './segment'
import type { AlignedDoc, Cue, Paragraph, Sentence } from './types'

/** Equal runs shorter than this are treated as coincidental and ignored. */
const MIN_RUN = 3
/** A sentence counts as synced when at least this share of its characters matched. */
const SYNC_RATIO = 0.3

export interface AlignOptions {
  duration?: number
  timeoutSec?: number
  /** Cues are single words with exact timing: interpolate strictly inside each cue. */
  precise?: boolean
}

interface Stream {
  chars: string[]
  times: Float64Array
  /** Content characters per second, estimated from the subtitle file. */
  rate: number
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function isAsciiWord(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9]/.test(ch)
}

/**
 * Flattens cues into one character stream with an estimated time per character.
 * ASR subtitles often cap a cue's duration (e.g. 7 s) while the speech keeps going
 * until the next cue, so a cue is stretched to the length its text needs at the
 * estimated speaking rate, but never past the next cue's start.
 */
export function buildSubtitleStream(cues: Cue[], precise = false): Stream {
  const items = cues
    .map((c) => ({ start: c.start, end: c.end, chars: Array.from(c.text.replace(/\s+/g, ' ').trim()) }))
    .filter((c) => c.chars.length > 0)
  let totalChars = 0
  let totalSpan = 0
  const contentCounts = items.map((c) => c.chars.filter(isContentChar).length)
  for (let i = 0; i < items.length; i++) {
    const spanEnd = i + 1 < items.length ? items[i + 1].start : items[i].end
    const span = spanEnd - items[i].start
    if (span > 0.05) {
      totalChars += contentCounts[i]
      totalSpan += span
    }
  }
  const rate = totalSpan > 0 && totalChars > 0 ? totalChars / totalSpan : 5
  const chars: string[] = []
  const times: number[] = []
  for (let i = 0; i < items.length; i++) {
    const c = items[i]
    let effEnd: number
    if (precise) {
      effEnd = c.end > c.start ? c.end : i + 1 < items.length ? items[i + 1].start : c.start + 0.2
    } else {
      const natural = c.start + contentCounts[i] / (rate * 0.95)
      effEnd = Math.max(c.end, natural)
      if (i + 1 < items.length) effEnd = Math.min(effEnd, Math.max(items[i + 1].start, c.start + 0.2))
    }
    if (chars.length && isAsciiWord(chars[chars.length - 1]) && isAsciiWord(c.chars[0])) {
      chars.push(' ')
      times.push(c.start)
    }
    const n = c.chars.length
    for (let k = 0; k < n; k++) {
      chars.push(c.chars[k])
      times.push(c.start + (k / n) * (effEnd - c.start))
    }
  }
  return { chars, times: Float64Array.from(times), rate }
}

/** Fills the gaps between anchored characters by linear interpolation. */
function interpolate(anchor: Float64Array, rate: number, duration?: number): Float64Array {
  const n = anchor.length
  const out = new Float64Array(n)
  let first = 0
  while (first < n && Number.isNaN(anchor[first])) first++
  if (first === n) return out.fill(NaN)
  for (let k = 0; k < first; k++) out[k] = Math.max(0, anchor[first] - (first - k) / rate)
  out[first] = anchor[first]
  let prev = first
  for (let i = first + 1; i < n; i++) {
    if (Number.isNaN(anchor[i])) continue
    const ta = out[prev]
    const tb = Math.max(anchor[i], ta)
    const span = i - prev
    for (let k = prev + 1; k < i; k++) out[k] = ta + ((k - prev) / span) * (tb - ta)
    out[i] = tb
    prev = i
  }
  for (let k = prev + 1; k < n; k++) {
    let t = out[prev] + (k - prev) / rate
    if (duration && duration > 0) t = Math.min(t, duration)
    out[k] = t
  }
  return out
}

function buildDoc(
  source: AlignedDoc['source'],
  seg: Segmented,
  times: Float64Array,
  anchor: Float64Array,
  cueCount: number,
  precise: boolean,
  t0: number,
): AlignedDoc {
  const sentences: Sentence[] = []
  let prevStart = 0
  let totalContent = 0
  let totalAnchored = 0
  for (let i = 0; i < seg.sentences.length; i++) {
    const s = seg.sentences[i]
    const chars = seg.chars.slice(s.from, s.to)
    const t = times.slice(s.from, s.to)
    let content = 0
    let anchored = 0
    let start = NaN
    let end = NaN
    for (let k = 0; k < chars.length; k++) {
      if (!isContentChar(chars[k])) continue
      content++
      if (!Number.isNaN(anchor[s.from + k])) anchored++
      if (Number.isNaN(start)) start = t[k]
      end = t[k]
    }
    if (Number.isNaN(start) && t.length) {
      start = t[0]
      end = t[t.length - 1]
    }
    if (Number.isNaN(start)) start = prevStart
    if (Number.isNaN(end)) end = start
    start = Math.max(start, prevStart)
    end = Math.max(end, start)
    prevStart = start
    totalContent += content
    totalAnchored += anchored
    sentences.push({
      id: i,
      para: s.para,
      text: chars.join(''),
      chars,
      times: t,
      start,
      end,
      synced: content > 0 && anchored / content >= SYNC_RATIO,
      anchored,
      content,
    })
  }
  const paragraphs: Paragraph[] = seg.paragraphs.map((p, id) => ({
    id,
    kind: p.kind,
    level: p.level,
    from: 0,
    to: 0,
    start: 0,
    end: 0,
  }))
  for (const p of paragraphs) {
    p.from = -1
    p.to = -1
  }
  for (const s of sentences) {
    const p = paragraphs[s.para]
    if (p.from < 0) p.from = s.id
    p.to = s.id + 1
  }
  for (const p of paragraphs) {
    if (p.from < 0) {
      p.from = p.to = 0
      continue
    }
    p.start = sentences[p.from].start
    p.end = sentences[p.to - 1].end
  }
  return {
    source,
    paragraphs,
    sentences,
    stats: {
      cues: cueCount,
      chars: seg.chars.length,
      content: totalContent,
      anchored: totalAnchored,
      ratio: totalContent ? totalAnchored / totalContent : 0,
      ms: Math.round(now() - t0),
      precise,
    },
  }
}

/** Aligns a clean transcript against timed subtitle cues. */
export function alignTranscript(transcript: string, cues: Cue[], opts: AlignOptions = {}): AlignedDoc {
  const t0 = now()
  const seg = segmentTranscript(transcript)
  const stream = buildSubtitleStream(cues, !!opts.precise)
  const nt = normalizeChars(seg.chars)
  const ns = normalizeChars(stream.chars)
  const anchor = new Float64Array(seg.chars.length).fill(NaN)
  if (nt.norm.length && ns.norm.length) {
    const dmp = new DiffMatchPatch()
    dmp.Diff_Timeout = opts.timeoutSec ?? 30
    const diffs = dmp.diff_main(nt.norm, ns.norm, false)
    let it = 0
    let is = 0
    for (const [op, s] of diffs) {
      const len = s.length
      if (op === 0) {
        if (len >= MIN_RUN) {
          for (let k = 0; k < len; k++) anchor[nt.map[it + k]] = stream.times[ns.map[is + k]]
        }
        it += len
        is += len
      } else if (op === -1) {
        it += len
      } else {
        is += len
      }
    }
  }
  const times = interpolate(anchor, stream.rate, opts.duration)
  return buildDoc('transcript', seg, times, anchor, cues.length, !!opts.precise, t0)
}

/** Builds a readable document straight from subtitles when no transcript is available. */
export function docFromSubtitles(cues: Cue[], opts: AlignOptions = {}): AlignedDoc {
  const parts: string[] = []
  let paraLen = 0
  for (let i = 0; i < cues.length; i++) {
    const text = cues[i].text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const prev = parts.length ? parts[parts.length - 1] : ''
    const joiner = prev && prev !== '\n' && isAsciiWord(prev[prev.length - 1]) && isAsciiWord(text[0]) ? ' ' : ''
    parts.push(joiner + text)
    paraLen += text.length
    const gap = i + 1 < cues.length ? cues[i + 1].start - cues[i].end : 0
    const endsSentence = /[。！？!?…][”’」』）)"']*$/.test(text)
    if ((endsSentence && (gap >= 1.2 || paraLen >= 200)) || paraLen >= 320) {
      parts.push('\n')
      paraLen = 0
    }
  }
  const doc = alignTranscript(parts.join(''), cues, opts)
  doc.source = 'subtitle'
  return doc
}
