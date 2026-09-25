import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fmtTime } from '../lib/format'
import { normalizeChar } from '../lib/normalize'
import type { AlignedDoc, Sentence } from '../lib/types'

interface Props {
  doc: AlignedDoc
  onJump: (s: Sentence) => void
  onClose: () => void
}

interface Hit {
  s: Sentence
  /** Code-point offsets of the match inside `s.chars`. */
  from: number
  to: number
}

const MAX_HITS = 300

/** Case-insensitive search that also ignores punctuation and spaces, so "神经 科学" finds "神经科学"。 */
function findHits(doc: AlignedDoc, query: string): Hit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const qNorm = Array.from(q).map(normalizeChar).join('')
  const hits: Hit[] = []
  for (const s of doc.sentences) {
    const lower = s.text.toLowerCase()
    const direct = lower.indexOf(q)
    if (direct >= 0) {
      const from = Array.from(lower.slice(0, direct)).length
      hits.push({ s, from, to: from + Array.from(q).length })
    } else if (qNorm) {
      // Map normalized characters back to code-point positions.
      const map: number[] = []
      let norm = ''
      s.chars.forEach((ch, i) => {
        const n = normalizeChar(ch)
        for (let k = 0; k < n.length; k++) map.push(i)
        norm += n
      })
      const at = norm.indexOf(qNorm)
      if (at >= 0) hits.push({ s, from: map[at], to: map[at + qNorm.length - 1] + 1 })
    }
    if (hits.length >= MAX_HITS) break
  }
  return hits
}

function Snippet({ hit }: { hit: Hit }) {
  const { s, from, to } = hit
  const lead = 24
  const start = Math.max(0, from - lead)
  const end = Math.min(s.chars.length, to + 60)
  return (
    <span className="hit-text">
      {start > 0 && '…'}
      {s.chars.slice(start, from).join('')}
      <mark>{s.chars.slice(from, to).join('')}</mark>
      {s.chars.slice(to, end).join('')}
      {end < s.chars.length && '…'}
    </span>
  )
}

export function SearchPanel({ doc, onJump, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const hits = useMemo(() => findHits(doc, query), [doc, query])
  const current = Math.min(cursor, Math.max(0, hits.length - 1))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('.hit.on')?.scrollIntoView({ block: 'nearest' })
  }, [current, hits])

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(hits.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter' && hits[current]) {
      onJump(hits[current].s)
      if (e.shiftKey) setCursor((c) => Math.max(0, c - 1))
      else setCursor((c) => Math.min(hits.length - 1, c + 1))
    }
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="panel search" role="dialog" aria-label="搜索">
        <div className="search-box">
          <Search size={16} />
          <input
            ref={inputRef}
            type="search"
            placeholder="搜索"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={onKey}
            spellCheck={false}
          />
          <button className="icon-btn sm" onClick={onClose} title="关闭 (Esc)">
            <X size={16} />
          </button>
        </div>
        {query.trim() && <div className="search-meta">{hits.length ? `${hits.length >= MAX_HITS ? `${MAX_HITS}+` : hits.length} 处` : '没有找到'}</div>}
        <div ref={listRef} className="hits">
          {hits.map((h, i) => (
            <button
              key={h.s.id}
              className={`hit ${i === current ? 'on' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => {
                setCursor(i)
                onJump(h.s)
              }}
            >
              <span className="hit-time">{fmtTime(h.s.start)}</span>
              <Snippet hit={h} />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
