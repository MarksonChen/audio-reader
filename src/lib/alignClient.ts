import { alignTranscript, docFromSubtitles } from './align'
import type { AlignedDoc, Cue } from './types'

let seq = 0
/** The worker still running, if any; a new request cancels it so a stale alignment cannot hog the CPU. */
let active: { worker: Worker; cancel: () => void } | null = null

function runInWorker(transcript: string | null, cues: Cue[], duration?: number, precise?: boolean): Promise<AlignedDoc> {
  return new Promise((resolve, reject) => {
    active?.cancel()
    const worker = new Worker(new URL('./align.worker.ts', import.meta.url), { type: 'module' })
    const id = ++seq
    const finish = () => {
      worker.terminate()
      if (active?.worker === worker) active = null
    }
    active = {
      worker,
      cancel: () => {
        finish()
        reject(new Error('superseded'))
      },
    }
    worker.onmessage = (e: MessageEvent<{ id: number; doc?: AlignedDoc; error?: string }>) => {
      if (e.data.id !== id) return
      finish()
      if (e.data.error || !e.data.doc) reject(new Error(e.data.error ?? 'alignment failed'))
      else resolve(e.data.doc)
    }
    worker.onerror = (e) => {
      finish()
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
    if (err instanceof Error && err.message === 'superseded') throw err
    console.warn('[audio-reader] worker alignment failed, running inline', err)
    const opts = { duration, precise }
    return transcript ? alignTranscript(transcript, cues, opts) : docFromSubtitles(cues, opts)
  }
}
