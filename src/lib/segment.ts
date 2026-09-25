export interface SegParagraph {
  kind: 'text' | 'heading'
  level: number
  from: number
  to: number
}

export interface SegSentence {
  para: number
  from: number
  to: number
}

export interface Segmented {
  chars: string[]
  paragraphs: SegParagraph[]
  sentences: SegSentence[]
}

const END = new Set(['。', '！', '？', '!', '?', '；', ';', '…'])
const CLOSE = new Set(['”', '’', '」', '』', '）', ')', '》', '〉', '】', ']', '"', "'", '〕'])
const SOFT = new Set(['，', ',', '、', '：', ':'])
const SOFT_MAX = 110
const SOFT_MIN = 45

function isDigit(ch: string | undefined): boolean {
  return !!ch && ch >= '0' && ch <= '9'
}

function isSpace(ch: string | undefined): boolean {
  return !!ch && /\s/.test(ch)
}

function cleanLine(line: string): { text: string; kind: 'text' | 'heading'; level: number } {
  let text = line.trim()
  let kind: 'text' | 'heading' = 'text'
  let level = 0
  const h = /^(#{1,6})\s+(.*)$/.exec(text)
  if (h) {
    kind = 'heading'
    level = h[1].length
    text = h[2].trim()
  }
  text = text.replace(/^>\s?/, '')
  text = text.replace(/^([-*+]|\d+[.)])\s+/, '')
  text = text.replace(/\*\*|__/g, '')
  text = text.replace(/[ \t]+/g, ' ')
  return { text, kind, level }
}

function splitSentences(chars: string[], from: number, to: number): [number, number][] {
  const out: [number, number][] = []
  let s = from
  for (let i = from; i < to; i++) {
    const ch = chars[i]
    let boundary = END.has(ch)
    if (!boundary && ch === '.') {
      const next = chars[i + 1]
      boundary = (i + 1 >= to || isSpace(next)) && !(isDigit(chars[i - 1]) && isDigit(chars[i + 2]))
    }
    if (!boundary) continue
    let j = i + 1
    while (j < to && (END.has(chars[j]) || CLOSE.has(chars[j]) || chars[j] === '.' || isSpace(chars[j]))) j++
    out.push([s, j])
    s = j
    i = j - 1
  }
  if (s < to) out.push([s, to])
  return out.flatMap(([a, b]) => softSplit(chars, a, b))
}

/** Break very long sentences at commas so highlights stay readable. */
function softSplit(chars: string[], from: number, to: number): [number, number][] {
  if (to - from <= SOFT_MAX) return [[from, to]]
  const out: [number, number][] = []
  let s = from
  let lastSoft = -1
  for (let i = from; i < to; i++) {
    if (SOFT.has(chars[i])) lastSoft = i
    if (i - s >= SOFT_MAX - 1 && lastSoft > s && lastSoft - s + 1 >= SOFT_MIN) {
      out.push([s, lastSoft + 1])
      s = lastSoft + 1
      lastSoft = -1
    }
  }
  if (s < to) {
    if (out.length && to - s < SOFT_MIN) out[out.length - 1][1] = to
    else out.push([s, to])
  }
  return out
}

export function segmentTranscript(input: string): Segmented {
  const text = input.normalize('NFC').replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const chars: string[] = []
  const paragraphs: SegParagraph[] = []
  const sentences: SegSentence[] = []
  for (const rawLine of text.split('\n')) {
    const { text: line, kind, level } = cleanLine(rawLine)
    if (!line) continue
    const from = chars.length
    for (const cp of line) chars.push(cp)
    const to = chars.length
    const para = paragraphs.length
    paragraphs.push({ kind, level, from, to })
    for (const [a, b] of splitSentences(chars, from, to)) sentences.push({ para, from: a, to: b })
  }
  return { chars, paragraphs, sentences }
}
