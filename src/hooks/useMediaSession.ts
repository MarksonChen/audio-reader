import { useEffect } from 'react'
import { usePlayer } from '../store/player'
import { useSettings } from '../store/settings'

export function useMediaSession(title: string | undefined) {
  useEffect(() => {
    if (!('mediaSession' in navigator) || !title) return
    const ms = navigator.mediaSession
    ms.metadata = new MediaMetadata({ title, artist: 'Audio Reader' })
    const p = usePlayer.getState
    ms.setActionHandler('play', () => p().play())
    ms.setActionHandler('pause', () => p().pause())
    ms.setActionHandler('seekbackward', (d) => p().skip(-(d.seekOffset ?? useSettings.getState().skipSeconds)))
    ms.setActionHandler('seekforward', (d) => p().skip(d.seekOffset ?? useSettings.getState().skipSeconds))
    ms.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) p().seek(d.seekTime)
    })
    return () => {
      ms.metadata = null
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
