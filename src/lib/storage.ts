import { createStore, del, get, set, update } from 'idb-keyval'

const store = createStore('audio-reader', 'kv')
const INDEX = 'sessions'
const MAX_SESSIONS = 20

export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  duration: number
  position: number
  audioName: string
  audioSize: number
  hasSubtitle: boolean
  hasTranscript: boolean
  demo?: boolean
  demoVersion?: number
  /** Subtitle carried exact per-word timing (forced alignment JSON). */
  precise?: boolean
  subtitleKind?: string
}

export interface SessionData extends SessionMeta {
  audio: Blob
  subtitleText: string | null
  subtitleName: string | null
  transcriptText: string | null
  transcriptName: string | null
}

export function toMeta(s: SessionData): SessionMeta {
  return {
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    duration: s.duration,
    position: s.position,
    audioName: s.audioName,
    audioSize: s.audioSize,
    hasSubtitle: s.hasSubtitle,
    hasTranscript: s.hasTranscript,
    demo: s.demo,
    demoVersion: s.demoVersion,
    precise: s.precise,
    subtitleKind: s.subtitleKind,
  }
}

export async function listSessions(): Promise<SessionMeta[]> {
  try {
    return (await get<SessionMeta[]>(INDEX, store)) ?? []
  } catch {
    return []
  }
}

/** Read-modify-write of the index inside one IndexedDB transaction, so concurrent saves cannot lose updates. */
async function updateIndex(fn: (list: SessionMeta[]) => SessionMeta[]): Promise<void> {
  await update<SessionMeta[]>(INDEX, (list) => fn(list ?? []), store)
}

export async function saveSession(data: SessionData): Promise<void> {
  await set(`session:${data.id}`, data, store)
  let dropped: SessionMeta[] = []
  await updateIndex((list) => {
    const next = [toMeta(data), ...list.filter((m) => m.id !== data.id)]
    dropped = next.slice(MAX_SESSIONS)
    return next.slice(0, MAX_SESSIONS)
  })
  for (const extra of dropped) await del(`session:${extra.id}`, store)
}

export async function getSession(id: string): Promise<SessionData | undefined> {
  return get<SessionData>(`session:${id}`, store)
}

export async function savePosition(id: string, position: number, duration?: number): Promise<void> {
  await updateIndex((list) => {
    const meta = list.find((m) => m.id === id)
    if (!meta) return list
    meta.position = position
    if (duration && duration > 0) meta.duration = duration
    meta.updatedAt = Date.now()
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  })
}

export async function deleteSession(id: string): Promise<void> {
  await del(`session:${id}`, store)
  await updateIndex((list) => list.filter((m) => m.id !== id))
}
