import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark' | 'sepia'
/** Id from `lib/accents.ts`. */
export type Accent = string
/** Id from `lib/fonts.ts`. */
export type ReadingFont = string
export type HighlightStyle = 'background' | 'underline' | 'none'
export type FollowAnchor = 'top' | 'center' | 'bottom'
export type FollowUnit = 'sentence' | 'paragraph'
export type SentenceEnd = 'continue' | 'pause' | 'repeat'

export interface Settings {
  // 外观
  theme: Theme
  accent: Accent
  /** Hex colour used when `accent` is 'custom'. */
  customAccent: string
  // 排版
  font: ReadingFont
  fontSize: number
  lineHeight: number
  /** Column width in rem; 0 means full width. */
  measure: number
  justify: boolean
  indent: boolean
  // 高亮
  highlightStyle: HighlightStyle
  dimPast: boolean
  dimOthers: boolean
  /** Seconds added to the media clock before matching text. */
  offset: number
  // 跟随
  autoFollow: boolean
  followAnchor: FollowAnchor
  followUnit: FollowUnit
  smoothScroll: boolean
  // 播放
  skipSeconds: number
  rate: number
  /** 0–1, applied to the audio element and remembered across sessions. */
  volume: number
  muted: boolean
  sentenceEnd: SentenceEnd
  playOnClick: boolean
  // 显示
  showTimestamps: boolean
  showWave: boolean
}

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void
  reset: () => void
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'orange',
  customAccent: '#c8551f',
  font: 'serif',
  fontSize: 19,
  lineHeight: 1.95,
  measure: 42,
  justify: true,
  indent: false,
  highlightStyle: 'background',
  dimPast: true,
  dimOthers: true,
  offset: 0,
  autoFollow: true,
  followAnchor: 'center',
  followUnit: 'sentence',
  smoothScroll: true,
  skipSeconds: 15,
  rate: 1,
  volume: 0.5,
  muted: false,
  sentenceEnd: 'continue',
  playOnClick: true,
  showTimestamps: true,
  showWave: true,
}

export const ANCHOR_FRACTION: Record<FollowAnchor, number> = { top: 0.22, center: 0.38, bottom: 0.56 }
export const SKIP_OPTIONS = [5, 10, 15, 30]
export const FONT_SIZE_RANGE = { min: 14, max: 32 }
export const LINE_HEIGHT_RANGE = { min: 1.4, max: 2.6 }
/** Slider range for the column width; the top end means full width. */
export const MEASURE_RANGE = { min: 28, max: 66 }
export const OFFSET_RANGE = { min: -2, max: 2 }
export const RATE_SLIDER_RANGE = { min: 0.25, max: 3 }

const LEGACY_MEASURE: Record<string, number> = { narrow: 34, normal: 42, wide: 50, full: 0 }

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'audio-reader.settings',
      version: 4,
      migrate: (persisted, version) => {
        const p = { ...(persisted as Partial<Record<keyof Settings, unknown>>) }
        if (typeof p.measure === 'string') p.measure = LEGACY_MEASURE[p.measure] ?? 42
        // v3 defaulted the volume to 100%; a stored 1 almost certainly means "never touched".
        if (version < 4 && p.volume === 1) p.volume = DEFAULT_SETTINGS.volume
        return { ...DEFAULT_SETTINGS, ...(p as Partial<Settings>) }
      },
    },
  ),
)

export function resolveTheme(theme: Theme): 'light' | 'dark' | 'sepia' {
  if (theme !== 'system') return theme
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
