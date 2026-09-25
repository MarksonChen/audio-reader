import { looksLikeSubtitle } from './subtitles'

export type FileKind = 'audio' | 'subtitle' | 'transcript' | 'unknown'

const AUDIO_EXT = new Set(['mp3', 'm4a', 'm4b', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'webm', 'mp4', 'wma', 'aiff', 'aif', 'caf'])
const SUB_EXT = new Set(['srt', 'vtt', 'lrc', 'sbv'])
const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'text'])
const JSON_EXT = new Set(['json'])

export const ACCEPT = [...AUDIO_EXT, ...SUB_EXT, ...JSON_EXT, ...TEXT_EXT].map((e) => `.${e}`).join(',')

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  flac: 'audio/flac',
  webm: 'audio/webm',
  mp4: 'audio/mp4',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  caf: 'audio/x-caf',
}

/** Browsers often leave `File.type` empty for .opus and friends; guess it from the extension. */
export function audioMime(name: string, fallback = ''): string {
  return AUDIO_MIME[extOf(name)] ?? fallback
}

export function extOf(name: string): string {
  const m = /\.([^.]+)$/.exec(name)
  return m ? m[1].toLowerCase() : ''
}

export async function readTextFile(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength))
  if (head.length === 2 && head[0] === 0xff && head[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf)
  if (head.length === 2 && head[0] === 0xfe && head[1] === 0xff) return new TextDecoder('utf-16be').decode(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buf)
    } catch {
      return new TextDecoder().decode(buf)
    }
  }
}

export async function classifyFile(file: File): Promise<{ kind: FileKind; text?: string }> {
  const ext = extOf(file.name)
  if (AUDIO_EXT.has(ext) || file.type.startsWith('audio/') || file.type.startsWith('video/')) return { kind: 'audio' }
  if (SUB_EXT.has(ext)) return { kind: 'subtitle', text: await readTextFile(file) }
  if (JSON_EXT.has(ext) || file.type === 'application/json') {
    const text = await readTextFile(file)
    return looksLikeSubtitle(text) ? { kind: 'subtitle', text } : { kind: 'unknown' }
  }
  if (TEXT_EXT.has(ext) || file.type.startsWith('text/') || (!ext && file.size < 5_000_000)) {
    const text = await readTextFile(file)
    return { kind: looksLikeSubtitle(text) ? 'subtitle' : 'transcript', text }
  }
  return { kind: 'unknown' }
}
