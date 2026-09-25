export interface Cue {
  start: number
  end: number
  text: string
}

export interface Sentence {
  id: number
  para: number
  /** Full text of the sentence, punctuation included. */
  text: string
  /** Code points of `text`. */
  chars: string[]
  /** Estimated speech time (seconds) of every code point in `chars`. */
  times: Float64Array
  /** Index (into `AlignedDoc.cueStarts`) of the subtitle cue each code point belongs to. */
  cues: Int32Array
  start: number
  end: number
  /** True when enough characters were matched against the subtitle stream. */
  synced: boolean
  anchored: number
  content: number
}

export interface Paragraph {
  id: number
  kind: 'text' | 'heading'
  level: number
  from: number
  to: number
  start: number
  end: number
}

export interface AlignStats {
  cues: number
  chars: number
  content: number
  anchored: number
  ratio: number
  ms: number
  /** Timing came from word-level forced alignment rather than interpolated cues. */
  precise: boolean
}

export interface AlignedDoc {
  source: 'transcript' | 'subtitle'
  paragraphs: Paragraph[]
  sentences: Sentence[]
  /** Start time of every subtitle cue, in order; used for block-wise highlighting. */
  cueStarts: Float64Array
  stats: AlignStats
}
