import { create } from 'zustand'
import { runAlignment } from '../lib/alignClient'
import { audioMime, classifyFile, readTextFile } from '../lib/files'
import { stripExt } from '../lib/format'
import { computePeaks } from '../lib/peaks'
import { parseSubtitles } from '../lib/subtitles'
import { useFlags } from './flags'
import { usePlayer } from './player'
import {
  deleteSession,
  getSession,
  listSessions,
  savePosition,
  saveSession,
  type SessionData,
  type SessionMeta,
} from '../lib/storage'
import type { AlignedDoc } from '../lib/types'

export type Status = 'home' | 'loading' | 'reader'

export interface PendingFiles {
  audio?: File
  subtitle?: File
  transcript?: File
}

interface SessionState {
  status: Status
  loadingMessage: string
  error: string | null
  toast: string | null
  session: SessionData | null
  doc: AlignedDoc | null
  audioUrl: string | null
  peaks: Float32Array | null
  recents: SessionMeta[]
  refreshRecents: () => Promise<void>
  addFiles: (files: File[], pending: PendingFiles) => Promise<{ pending: PendingFiles; rejected: string[] }>
  openPending: (pending: PendingFiles) => Promise<void>
  openDemo: () => Promise<void>
  openStored: (id: string) => Promise<void>
  removeStored: (id: string) => Promise<void>
  savePosition: (position: number, duration?: number) => Promise<void>
  showToast: (msg: string | null) => void
  setError: (msg: string | null) => void
  close: () => void
}

const DEMO_TITLE = '全球脑科学科研组织的二十年'
/** Bump when the bundled demo files change so cached copies get refreshed. */
const DEMO_VERSION = 6

let toastTimer = 0
let loadSeq = 0

export const useSession = create<SessionState>()((set, get) => {
  const setAudioUrl = (url: string | null) => {
    const prev = get().audioUrl
    if (prev) URL.revokeObjectURL(prev)
    set({ audioUrl: url })
  }

  async function load(data: SessionData): Promise<void> {
    const seq = ++loadSeq
    set({ status: 'loading', loadingMessage: '解析字幕…', error: null, doc: null, peaks: null })
    try {
      const { cues, precise, kind } = parseSubtitles(data.subtitleText ?? '')
      if (!cues.length) throw new Error('字幕文件里没有找到可用的时间轴，请检查是否为 SRT / VTT / LRC 或 JSON 格式。')
      data.precise = precise
      data.subtitleKind = kind
      set({ loadingMessage: data.transcriptText ? '对齐原稿与字幕…' : '整理字幕…' })
      const duration = data.duration || undefined
      let doc: AlignedDoc
      let toast: string | null = null
      if (data.transcriptText) {
        doc = await runAlignment(data.transcriptText, cues, duration, precise)
        if (doc.stats.ratio < 0.2) {
          // The transcript cannot be matched to this audio; the subtitle text is the only usable body.
          toast = `原稿与字幕的匹配度只有 ${Math.round(doc.stats.ratio * 100)}%，暂时改用字幕文字显示。`
          doc = await runAlignment(null, cues, duration, precise)
        }
      } else {
        doc = await runAlignment(null, cues, duration, precise)
      }
      if (seq !== loadSeq) return
      setAudioUrl(URL.createObjectURL(data.audio))
      set({ status: 'reader', session: data, doc })
      if (toast) get().showToast(toast)
      void computePeaks(data.audio, 2400, data.duration)
        .then((result) => {
          if (seq !== loadSeq || !result) return
          set({ peaks: result.peaks })
          usePlayer.getState().setDurationHint(result.duration)
        })
        .catch(() => undefined)
    } catch (err) {
      if (seq !== loadSeq || (err instanceof Error && err.message === 'superseded')) return
      set({ status: 'home', error: err instanceof Error ? err.message : String(err) })
    }
  }

  async function persist(data: SessionData): Promise<void> {
    try {
      await saveSession(data)
      await get().refreshRecents()
    } catch (err) {
      console.warn('[audio-reader] could not persist session', err)
      get().showToast('无法保存到本地存储（可能是隐私模式），刷新后需要重新上传。')
    }
  }

  return {
    status: 'home',
    loadingMessage: '',
    error: null,
    toast: null,
    session: null,
    doc: null,
    audioUrl: null,
    peaks: null,
    recents: [],

    refreshRecents: async () => set({ recents: await listSessions() }),

    addFiles: async (files, pending) => {
      const next = { ...pending }
      const rejected: string[] = []
      for (const file of files) {
        const { kind } = await classifyFile(file)
        if (kind === 'audio') next.audio = file
        else if (kind === 'subtitle') next.subtitle = file
        else if (kind === 'transcript') next.transcript = file
        else rejected.push(file.name)
      }
      return { pending: next, rejected }
    },

    openPending: async (pending) => {
      if (get().status === 'loading') return
      if (!pending.audio) {
        set({ error: '还需要一个音频文件（MP3、M4A、WAV…）。' })
        return
      }
      if (!pending.subtitle) {
        set({ error: '还需要一个字幕文件（SRT、VTT 或 LRC），高亮与滚动依赖它的时间轴。' })
        return
      }
      set({ status: 'loading', loadingMessage: '读取文件…', error: null })
      let subtitleText: string
      let transcriptText: string | null
      try {
        subtitleText = await readTextFile(pending.subtitle)
        transcriptText = pending.transcript ? await readTextFile(pending.transcript) : null
      } catch (err) {
        // Typically the file changed on disk after it was picked (NotReadableError).
        set({ status: 'home', error: `读取文件失败：${err instanceof Error ? err.message : String(err)}，请重新选择。` })
        return
      }
      const mime = pending.audio.type || audioMime(pending.audio.name)
      const audioBlob = pending.audio.type ? pending.audio : new Blob([pending.audio], { type: mime })
      const now = Date.now()
      const data: SessionData = {
        id: crypto.randomUUID(),
        title: stripExt(pending.transcript?.name ?? pending.audio.name),
        createdAt: now,
        updatedAt: now,
        duration: 0,
        position: 0,
        audioName: pending.audio.name,
        audioSize: pending.audio.size,
        hasSubtitle: true,
        hasTranscript: !!transcriptText,
        audio: audioBlob,
        subtitleText,
        subtitleName: pending.subtitle.name,
        transcriptText,
        transcriptName: pending.transcript?.name ?? null,
      }
      await load(data)
      if (get().session === data) void persist(data)
    },

    openDemo: async () => {
      if (get().status === 'loading') return
      useFlags.getState().dismissDemo()
      const existing = get().recents.find((r) => r.demo)
      if (existing && (existing.demoVersion ?? 1) >= DEMO_VERSION) return get().openStored(existing.id)
      set({ status: 'loading', loadingMessage: '下载示例音频…', error: null })
      try {
        // The version query defeats stale CDN/browser copies of the demo files after an update.
        const base = `${import.meta.env.BASE_URL}demo/`
        const v = `?v=${DEMO_VERSION}`
        const [audioRes, srtRes, txtRes, wordsRes] = await Promise.all([
          fetch(`${base}demo.opus${v}`),
          fetch(`${base}demo.srt${v}`),
          fetch(`${base}demo.txt${v}`),
          fetch(`${base}demo.words.srt${v}`).catch(() => null),
        ])
        if (!audioRes.ok || !srtRes.ok || !txtRes.ok) throw new Error('示例文件缺失，请确认 public/demo 目录完整。')
        const audio = await audioRes.blob()
        // Prefer the forced-alignment word-level subtitle when it ships with the demo.
        const wordsText = wordsRes && wordsRes.ok ? await wordsRes.text() : ''
        const hasWords = /^\s*1\s*\n\d{2}:\d{2}:\d{2},\d{3} -->/.test(wordsText)
        const subtitleText = hasWords ? wordsText : await srtRes.text()
        const subtitleName = hasWords ? `${DEMO_TITLE}.words.srt` : `${DEMO_TITLE}.srt`
        const now = Date.now()
        const data: SessionData = {
          id: crypto.randomUUID(),
          title: DEMO_TITLE,
          createdAt: now,
          updatedAt: now,
          duration: 0,
          position: 0,
          audioName: `${DEMO_TITLE}.opus`,
          audioSize: audio.size,
          hasSubtitle: true,
          hasTranscript: true,
          demo: true,
          // A failed JSON fetch falls back to the SRT; mark it stale so the next visit retries.
          demoVersion: hasWords ? DEMO_VERSION : 1,
          audio: new Blob([audio], { type: 'audio/ogg; codecs=opus' }),
          subtitleText,
          subtitleName,
          transcriptText: await txtRes.text(),
          transcriptName: `${DEMO_TITLE}.txt`,
        }
        await load(data)
        if (get().session === data) {
          void persist(data).then(() => {
            if (existing) return get().removeStored(existing.id)
          })
        }
      } catch (err) {
        set({ status: 'home', error: err instanceof Error ? err.message : String(err) })
      }
    },

    openStored: async (id) => {
      if (get().status === 'loading') return
      set({ status: 'loading', loadingMessage: '读取本地缓存…', error: null })
      const data = await getSession(id).catch(() => undefined)
      if (!data) {
        set({ status: 'home', error: '这条记录已经不在本地缓存里了。' })
        await get().refreshRecents()
        return
      }
      const meta = get().recents.find((r) => r.id === id)
      if (meta) {
        data.position = meta.position
        data.duration = meta.duration
      }
      await load(data)
    },

    removeStored: async (id) => {
      await deleteSession(id).catch(() => undefined)
      await get().refreshRecents()
    },

    savePosition: async (position, duration) => {
      const s = get().session
      if (!s) return
      s.position = position
      if (duration) s.duration = duration
      await savePosition(s.id, position, duration).catch(() => undefined)
    },

    showToast: (msg) => {
      window.clearTimeout(toastTimer)
      set({ toast: msg })
      if (msg) toastTimer = window.setTimeout(() => set({ toast: null }), 4500)
    },

    setError: (msg) => set({ error: msg }),

    close: () => {
      loadSeq++
      setAudioUrl(null)
      set({ status: 'home', session: null, doc: null, peaks: null, error: null })
      void get().refreshRecents()
    },
  }
})
