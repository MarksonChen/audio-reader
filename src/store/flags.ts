import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Small persistent facts about the user's history, independent of the reading settings. */
interface Flags {
  /** The demo button is hidden once the demo was opened or the user has listened for a minute. */
  demoDismissed: boolean
  listenedSeconds: number
  dismissDemo: () => void
  addListened: (seconds: number) => void
}

export const DEMO_DISMISS_AFTER_SECONDS = 60

export const useFlags = create<Flags>()(
  persist(
    (set) => ({
      demoDismissed: false,
      listenedSeconds: 0,
      dismissDemo: () => set({ demoDismissed: true }),
      addListened: (seconds) =>
        set((f) => {
          const total = f.listenedSeconds + seconds
          return { listenedSeconds: total, demoDismissed: f.demoDismissed || total >= DEMO_DISMISS_AFTER_SECONDS }
        }),
    }),
    { name: 'audio-reader.flags', version: 1 },
  ),
)
