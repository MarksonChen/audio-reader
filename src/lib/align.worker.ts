import { alignTranscript, docFromSubtitles } from './align'
import type { Cue } from './types'

export interface AlignRequest {
  id: number
  transcript: string | null
  cues: Cue[]
  duration?: number
  precise?: boolean
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AlignRequest>) => void) | null
  postMessage: (msg: unknown) => void
}

ctx.onmessage = (e) => {
  const { id, transcript, cues, duration, precise } = e.data
  try {
    const opts = { duration, precise }
    const doc = transcript ? alignTranscript(transcript, cues, opts) : docFromSubtitles(cues, opts)
    ctx.postMessage({ id, doc })
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
