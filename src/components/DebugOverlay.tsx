import { useDebug } from '../lib/debug'
import { useSettings } from '../store/settings'

export function DebugOverlay() {
  const frames = useDebug((s) => s.frames)
  const maxDelta = useDebug((s) => s.maxDelta)
  const anomalies = useDebug((s) => s.anomalies)
  const font = useSettings((s) => s.font)
  const fontSize = useSettings((s) => s.fontSize)
  const env = `${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '')} · dpr ${window.devicePixelRatio} · ${window.innerWidth}×${window.innerHeight} · font ${font} ${fontSize}px`
  const text = [env, `frames ${frames} · max Δtop ${maxDelta.toFixed(2)}px`, ...anomalies.map((a) => `${a.at} "${a.char}" Δ${a.delta} tops ${a.tops.join('/')} lefts ${a.lefts.join('/')} h ${a.heights.join('/')} scroll ${a.scrollTop}`)].join('\n')
  return (
    <div className="debug">
      <div className="debug-head">
        <span>highlight debug</span>
        <button onClick={() => void navigator.clipboard?.writeText(text)}>复制</button>
      </div>
      <pre>{text}</pre>
    </div>
  )
}
