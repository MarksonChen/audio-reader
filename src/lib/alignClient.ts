import { alignTranscript, docFromSubtitles } from './align'
import type { AlignedDoc, Cue } from './types'

let seq = 0

function runInWorker(transcript: string | null, cues: Cue[], duration?: number, precise?: boolean): Promise<AlignedDoc> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./align.worker.ts', import.meta.url), { type: 'module' })
    const id = ++seq
    worker.onmessage = (e: MessageEvent<{ id: number; doc?: AlignedDoc; error?: string }>) => {
      if (e.data.id !== id) return
      worker.terminate()
      if (e.data.error || !e.data.doc) reject(new Error(e.data.error ?? 'alignment failed'))
      else resolve(e.data.doc)
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(e.error ?? new Error(e.message || 'worker error'))
    }
    worker.postMessage({ id, transcript, cues, duration, precise })
  })
}

/** Runs the alignment off the main thread, falling back to inline execution. */
export async function runAlignment(
  transcript: string | null,
  cues: Cue[],
  duration?: number,
  precise = false,
): Promise<AlignedDoc> {
  try {
    return await runInWorker(transcript, cues, duration, precise)
  } catch (err) {
    console.warn('[audio-reader] worker alignment failed, running inline', err)
    const opts = { duration, precise }
    return transcript ? alignTranscript(transcript, cues, opts) : docFromSubtitles(cues, opts)
  }
}
