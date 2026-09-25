import { createStore, del, get, set } from 'idb-keyval'

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

async function writeIndex(list: SessionMeta[]): Promise<void> {
  await set(INDEX, list, store)
}

export async function saveSession(data: SessionData): Promise<void> {
  await set(`session:${data.id}`, data, store)
  const list = (await listSessions()).filter((m) => m.id !== data.id)
  list.unshift(toMeta(data))
  const keep = list.slice(0, MAX_SESSIONS)
  for (const extra of list.slice(MAX_SESSIONS)) await del(`session:${extra.id}`, store)
  await writeIndex(keep)
}

export async function getSession(id: string): Promise<SessionData | undefined> {
  return get<SessionData>(`session:${id}`, store)
}

export async function savePosition(id: string, position: number, duration?: number): Promise<void> {
  const list = await listSessions()
  const meta = list.find((m) => m.id === id)
  if (!meta) return
  meta.position = position
  if (duration && duration > 0) meta.duration = duration
  meta.updatedAt = Date.now()
  list.sort((a, b) => b.updatedAt - a.updatedAt)
  await writeIndex(list)
}

export async function deleteSession(id: string): Promise<void> {
  await del(`session:${id}`, store)
  await writeIndex((await listSessions()).filter((m) => m.id !== id))
}
