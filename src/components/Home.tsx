import { Captions, Check, CircleAlert, FileMusic, FileText, LoaderCircle, Sparkles, Trash, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ComponentType, type DragEvent } from 'react'
import { ACCEPT } from '../lib/files'
import { fmtBytes, fmtDate, fmtTime } from '../lib/format'
import type { SessionMeta } from '../lib/storage'
import { useSession, type PendingFiles } from '../store/session'

interface SlotProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  hint: string
  accept: string
  file?: File
  required?: boolean
  onPick: (file: File) => void
  onClear: () => void
}

function Slot({ icon: Icon, label, hint, accept, file, required, onPick, onClear }: SlotProps) {
  const id = `slot-${label}`
  return (
    <div className={`slot ${file ? 'filled' : ''}`}>
      <input
        id={id}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
      <label htmlFor={id} className="slot-body">
        <span className="slot-icon">{file ? <Check size={18} strokeWidth={2.5} /> : <Icon size={18} />}</span>
        <span className="slot-text">
          <span className="slot-label">
            {label}
            {required ? <em>必需</em> : <em className="opt">可选</em>}
          </span>
          <span className="slot-hint" title={file?.name}>
            {file ? `${file.name} · ${fmtBytes(file.size)}` : hint}
          </span>
        </span>
      </label>
      {file && (
        <button className="slot-clear" onClick={onClear} title="移除">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function RecentCard({ meta, onOpen, onRemove }: { meta: SessionMeta; onOpen: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (!confirm) return
    const t = window.setTimeout(() => setConfirm(false), 3000)
    return () => window.clearTimeout(t)
  }, [confirm])
  const progress = meta.duration ? Math.min(1, meta.position / meta.duration) : 0
  return (
    <div className="recent" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="recent-top">
        <div className="recent-title" title={meta.title}>
          {meta.title}
        </div>
        <button
          className={`recent-del ${confirm ? 'confirm' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (confirm) onRemove()
            else setConfirm(true)
          }}
          title="删除本地缓存"
        >
          {confirm ? '确认删除' : <Trash size={14} />}
        </button>
      </div>
      <div className="recent-meta">
        {meta.duration ? fmtTime(meta.duration) : '—'} · {meta.hasTranscript ? '原稿 + 字幕' : '仅字幕'} · {fmtDate(meta.updatedAt)}
      </div>
      <div className="recent-bar">
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="recent-foot">
        <span>{progress > 0.98 ? '已听完' : progress > 0 ? `继续 · ${fmtTime(meta.position)}` : '尚未开始'}</span>
        <span className="tags">{meta.demo && <span className="tag muted">示例</span>}</span>
      </div>
    </div>
  )
}

export function Home() {
  const status = useSession((s) => s.status)
  const loadingMessage = useSession((s) => s.loadingMessage)
  const error = useSession((s) => s.error)
  const recents = useSession((s) => s.recents)
  const addFiles = useSession((s) => s.addFiles)
  const openPending = useSession((s) => s.openPending)
  const openDemo = useSession((s) => s.openDemo)
  const openStored = useSession((s) => s.openStored)
  const removeStored = useSession((s) => s.removeStored)
  const setError = useSession((s) => s.setError)

  const [pending, setPending] = useState<PendingFiles>({})
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const handleFiles = useCallback(
    async (list: FileList | File[]) => {
      const { pending: next, rejected } = await addFiles(Array.from(list), pending)
      setPending(next)
      setError(rejected.length ? `无法识别这些文件：${rejected.join('、')}` : null)
    },
    [addFiles, pending, setError],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDrag(false)
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
  }

  const ready = !!pending.audio && !!pending.subtitle

  return (
    <div
      className={`home ${drag ? 'dragging' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current++
        setDrag(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDrag(false)
      }}
      onDrop={onDrop}
    >
      <div className="home-inner">
        <header className="hero">
          <div className="logo">
            <span className="logo-mark" aria-hidden>
              <i /><i /><i /><i /><i />
            </span>
            <span className="logo-text">Audio Reader</span>
          </div>
          <h1>边听，边读。</h1>
          <p className="lede">
            上传音频、字幕和原稿，文字会跟着声音逐句点亮、自动滚动。
            <br />
            原稿会被自动对齐到字幕的时间轴上，所有文件只保存在你的浏览器里。
          </p>
        </header>

        <section className="uploader">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button className={`dropzone ${drag ? 'active' : ''}`} onClick={() => inputRef.current?.click()}>
            <span className="dz-icon">
              <Upload size={22} />
            </span>
            <span className="dz-title">把音频、字幕、原稿一起拖进来</span>
            <span className="dz-sub">或点击选择文件</span>
          </button>

          <div className="slots">
            <Slot
              icon={FileMusic}
              label="音频"
              hint="MP3 / M4A / WAV"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.opus,.webm"
              file={pending.audio}
              required
              onPick={(f) => setPending((p) => ({ ...p, audio: f }))}
              onClear={() => setPending((p) => ({ ...p, audio: undefined }))}
            />
            <Slot
              icon={Captions}
              label="字幕"
              hint="SRT / VTT / LRC / JSON"
              accept=".srt,.vtt,.lrc,.sbv,.json,.txt"
              file={pending.subtitle}
              required
              onPick={(f) => setPending((p) => ({ ...p, subtitle: f }))}
              onClear={() => setPending((p) => ({ ...p, subtitle: undefined }))}
            />
            <Slot
              icon={FileText}
              label="原稿"
              hint="TXT / Markdown"
              accept=".txt,.md,.markdown,.text,text/plain"
              file={pending.transcript}
              onPick={(f) => setPending((p) => ({ ...p, transcript: f }))}
              onClear={() => setPending((p) => ({ ...p, transcript: undefined }))}
            />
          </div>

          {error && (
            <div className="alert">
              <CircleAlert size={16} />
              <span>{error}</span>
              <button onClick={() => setError(null)} title="关闭">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="actions">
            <button className="btn primary" disabled={!ready} onClick={() => void openPending(pending)}>
              开始阅读
            </button>
            <button className="btn ghost" onClick={() => void openDemo()}>
              <Sparkles size={16} />
              试试示例：全球脑科学科研组织的二十年 · 30 分钟
            </button>
          </div>
        </section>

        {recents.length > 0 && (
          <section className="recents">
            <h2>最近打开</h2>
            <div className="recent-grid">
              {recents.map((r) => (
                <RecentCard key={r.id} meta={r} onOpen={() => void openStored(r.id)} onRemove={() => void removeStored(r.id)} />
              ))}
            </div>
          </section>
        )}

        <footer className="home-foot">
          <a href="https://github.com/MarksonChen/audio-reader" target="_blank" rel="noreferrer">
            github.com/MarksonChen/audio-reader
          </a>
        </footer>
      </div>

      {status === 'loading' && (
        <div className="loading">
          <LoaderCircle className="spin" size={28} />
          <div>{loadingMessage}</div>
        </div>
      )}
    </div>
  )
}
