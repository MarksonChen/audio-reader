import type { Cue } from './types'

export type SubtitleKind = 'srt' | 'vtt' | 'sbv' | 'lrc' | 'words'

export interface ParsedSubtitles {
  cues: Cue[]
  /** True when every cue is a single word with exact timing (forced alignment output). */
  precise: boolean
  kind: SubtitleKind
}

const TIME_RE = /(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/
/** YouTube SBV timing line: `0:00:00.000,0:00:05.000`. */
const SBV_LINE = /^\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*,\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*$/
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu

function parseTime(s: string): number | null {
  const m = TIME_RE.exec(s)
  if (!m) return null
  const h = m[1] ? Number(m[1]) : 0
  const ms = Number(m[4].padEnd(3, '0'))
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000
}

function cleanCueText(raw: string): string {
  return raw
    .replace(/<\/?[a-zA-Z][^>]*>|<\d[^>]*>/g, '') // tags and inline timestamps, not "a < b"

    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

function parseSrtLike(text: string): Cue[] {
  const cues: Cue[] = []
  const blocks = text.split(/\n[ \t]*\n+/)
  for (const block of blocks) {
    const lines = block.split('\n')
    const ti = lines.findIndex((l) => l.includes('-->') || SBV_LINE.test(l))
    if (ti < 0) continue
    const [a, b] = lines[ti].includes('-->') ? lines[ti].split('-->') : lines[ti].split(',')
    const start = parseTime(a)
    const end = parseTime(b)
    if (start == null || end == null) continue
    const body = cleanCueText(lines.slice(ti + 1).join('\n'))
    if (!body) continue
    cues.push({ start, end: Math.max(end, start), text: body })
  }
  return cues
}

function parseLrc(text: string): Cue[] {
  const stamped: { start: number; text: string }[] = []
  // [mm:ss.xx], [mmm:ss.xx] and [hh:mm:ss.xx]; enhanced-LRC inline <mm:ss.xx> tags are dropped.
  const tag = /\[(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  for (const line of text.split('\n')) {
    const times: number[] = []
    let m: RegExpExecArray | null
    tag.lastIndex = 0
    while ((m = tag.exec(line))) {
      const frac = m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0
      times.push((m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]) + frac)
    }
    const body = line
      .replace(tag, '')
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '')
      .trim()
    if (!times.length || !body) continue
    for (const t of times) stamped.push({ start: t, text: body })
  }
  stamped.sort((x, y) => x.start - y.start)
  return stamped.map((s, i) => ({
    start: s.start,
    end: i + 1 < stamped.length ? stamped[i + 1].start : s.start + 5,
    text: s.text,
  }))
}

interface WordLike {
  text?: unknown
  word?: unknown
  start?: unknown
  end?: unknown
}

/**
 * Accepts word-timing JSON in several shapes:
 * - Audio Reader / stable-ts export: `{ words: [{ text, start, end }] }`
 * - whisper / stable-ts result: `{ segments: [{ words: [{ word, start, end }] }] }`
 * - a bare array of `{ word | text, start, end }`
 */
function cuesFromWordJson(data: unknown): Cue[] | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  let list: unknown[] | null = null
  if (Array.isArray(d.words)) list = d.words
  else if (Array.isArray(data)) list = data
  else if (Array.isArray(d.segments)) {
    list = (d.segments as Record<string, unknown>[]).flatMap((s) => (s && Array.isArray(s.words) ? s.words : []))
  }
  if (!list) return null
  const cues: Cue[] = []
  for (const item of list) {
    const w = item as WordLike
    const text = String(w.text ?? w.word ?? '').trim()
    if (!text || typeof w.start !== 'number' || typeof w.end !== 'number') continue
    cues.push({ start: w.start, end: Math.max(w.end, w.start), text })
  }
  return cues.length ? cues : null
}

function looksLikeWordJson(text: string): boolean {
  const head = text.trimStart()
  return (head.startsWith('{') || head.startsWith('[')) && /"start"\s*:/.test(text) && /"(words|segments|word|text)"\s*:/.test(text)
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** Word-level files (from forced alignment) have one word per cue: tiny texts and short durations. */
function isWordLevel(cues: Cue[]): boolean {
  if (cues.length < 20) return false
  const units = cues.map((c) => {
    const cjk = (c.text.match(CJK_RE) ?? []).length
    const words = (c.text.replace(CJK_RE, ' ').match(/[\p{L}\p{N}]+/gu) ?? []).length
    return cjk + words
  })
  return median(units) <= 2 && median(cues.map((c) => c.end - c.start)) <= 1.5
}

export function looksLikeSubtitle(text: string): boolean {
  return (
    /\d{1,2}:\d{2}[,.]\d{1,3}\s*-->/.test(text) ||
    /^\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*,\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*$/m.test(text) ||
    /^\s*\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/m.test(text) ||
    looksLikeWordJson(text)
  )
}

export function parseSubtitles(input: string): ParsedSubtitles {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const head = text.trimStart()
  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      const cues = cuesFromWordJson(JSON.parse(head))
      if (cues) {
        cues.sort((a, b) => a.start - b.start)
        return { cues, precise: true, kind: 'words' }
      }
    } catch {
      /* fall through to text formats */
    }
  }
  if (/-->/.test(text) || /^\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*,\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*$/m.test(text)) {
    const cues = parseSrtLike(text)
    cues.sort((a, b) => a.start - b.start)
    const kind: SubtitleKind = /^WEBVTT/.test(head) ? 'vtt' : /-->/.test(text) ? 'srt' : 'sbv'
    return { cues, precise: isWordLevel(cues), kind }
  }
  const cues = parseLrc(text)
  cues.sort((a, b) => a.start - b.start)
  return { cues, precise: isWordLevel(cues), kind: 'lrc' }
}
