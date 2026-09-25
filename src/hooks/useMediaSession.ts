import { useEffect } from 'react'
import { usePlayer } from '../store/player'

export function useMediaSession(title: string | undefined) {
  useEffect(() => {
    if (!('mediaSession' in navigator) || !title) return
    const ms = navigator.mediaSession
    ms.metadata = new MediaMetadata({ title, artist: 'Audio Reader' })
    const p = usePlayer.getState
    ms.setActionHandler('play', () => p().play())
    ms.setActionHandler('pause', () => p().pause())
    ms.setActionHandler('seekbackward', (d) => p().skip(-(d.seekOffset ?? 15)))
    ms.setActionHandler('seekforward', (d) => p().skip(d.seekOffset ?? 15))
    ms.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) p().seek(d.seekTime)
    })
    return () => {
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'] as MediaSessionAction[]) {
        try {
          ms.setActionHandler(a, null)
        } catch {
          /* ignore */
        }
      }
    }
  }, [title])
}
