const MAX_DECODE_BYTES = 400 * 1024 * 1024

async function decodeLowRate(buf: ArrayBuffer): Promise<AudioBuffer | null> {
  for (const sampleRate of [8000, 16000, 22050, 44100]) {
    try {
      const ctx = new OfflineAudioContext(1, 1, sampleRate)
      return await ctx.decodeAudioData(buf.slice(0))
    } catch {
      continue
    }
  }
  return null
}

export interface PeaksResult {
  peaks: Float32Array
  /** Exact duration from the decoded samples (some browsers misreport Ogg durations). */
  duration: number
}

/** Computes normalized waveform peaks (0..1) for drawing. Returns null when decoding is not possible. */
export async function computePeaks(blob: Blob, bins = 2400, durationHint = 0): Promise<PeaksResult | null> {
  // decodeAudioData first expands to float PCM at the native rate: roughly 350 MB per hour of stereo 44.1 kHz.
  if (blob.size > MAX_DECODE_BYTES || durationHint > 4 * 3600) return null
  const buf = await blob.arrayBuffer()
  const audio = await decodeLowRate(buf)
  if (!audio) return null
  const data = audio.getChannelData(0)
  const n = data.length
  const count = Math.min(bins, n)
  const per = n / count
  const peaks = new Float32Array(count)
  for (let b = 0; b < count; b++) {
    const s = Math.floor(b * per)
    const e = Math.min(n, Math.floor((b + 1) * per))
    let sum = 0
    for (let i = s; i < e; i++) sum += data[i] * data[i]
    peaks[b] = e > s ? Math.sqrt(sum / (e - s)) : 0
  }
  const sorted = Float32Array.from(peaks).sort()
  const ref = sorted[Math.floor(sorted.length * 0.97)] || 1
  for (let i = 0; i < count; i++) peaks[i] = Math.pow(Math.min(1, peaks[i] / ref), 1.15)
  return { peaks, duration: audio.duration }
}
