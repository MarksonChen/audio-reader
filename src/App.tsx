import { useEffect, useLayoutEffect } from 'react'
import { Home } from './components/Home'
import { Reader } from './components/Reader'
import { Toast } from './components/Toast'
import { accentColor, accentFor } from './lib/accents'
import { resolveTheme, useSettings } from './store/settings'
import { useSession } from './store/session'

export default function App() {
  const status = useSession((s) => s.status)
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const customAccent = useSettings((s) => s.customAccent)

  // Layout effect: descendants' passive effects (e.g. the waveform redraw) must see the new variables.
  useLayoutEffect(() => {
    const apply = () => {
      const resolved = resolveTheme(theme)
      const root = document.documentElement
      root.dataset.theme = resolved
      root.style.colorScheme = resolved === 'dark' ? 'dark' : 'light'
      root.style.setProperty('--accent', accentColor(accentFor(accent, customAccent), resolved === 'dark'))
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme, accent, customAccent])

  useEffect(() => {
    const boot = async () => {
      await useSession.getState().refreshRecents()
      if (new URLSearchParams(window.location.search).has('demo')) void useSession.getState().openDemo()
    }
    void boot()
  }, [])

  return (
    <>
      {status === 'reader' ? <Reader /> : <Home />}
      <Toast />
    </>
  )
}
