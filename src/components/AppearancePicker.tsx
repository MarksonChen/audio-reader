import { ArrowLeft, Check, Pipette, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ACCENTS, CUSTOM_ID, accentColor, accentFor, normalizeHex } from '../lib/accents'
import { FONTS, isFontAvailable } from '../lib/fonts'
import { resolveTheme, useSettings } from '../store/settings'

export type PickerTab = 'accent' | 'font'

interface Props {
  tab: PickerTab
  onTab: (tab: PickerTab) => void
  onBack: () => void
  onClose: () => void
}

const SAMPLE = '边听，边读。Audio Reader'

export function AppearancePicker({ tab, onTab, onBack, onClose }: Props) {
  const accent = useSettings((s) => s.accent)
  const customAccent = useSettings((s) => s.customAccent)
  const font = useSettings((s) => s.font)
  const theme = useSettings((s) => s.theme)
  const update = useSettings((s) => s.update)
  const dark = resolveTheme(theme) === 'dark'
  // Only fonts that are actually usable on this machine are offered.
  const fonts = useMemo(() => FONTS.filter(isFontAvailable), [])
  // The text field shows the stored colour unless the user is mid-edit of that same value.
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(null)
  const hexDraft = draft && draft.base === customAccent ? draft.text : customAccent
  const setHexDraft = (text: string) => setDraft({ base: customAccent, text })
  const customOn = accent === CUSTOM_ID
  const customShown = accentColor(accentFor(CUSTOM_ID, customAccent), dark)
  const commitHex = () => {
    const hex = normalizeHex(hexDraft)
    if (hex) update({ customAccent: hex, accent: CUSTOM_ID })
    setDraft(null)
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="panel picker" role="dialog" aria-label="强调色与字体">
        <div className="panel-head">
          <button className="link back" onClick={onBack}>
            <ArrowLeft size={14} />
            设置
          </button>
          <div className="seg">
            <button className={tab === 'accent' ? 'on' : ''} onClick={() => onTab('accent')}>
              强调色
            </button>
            <button className={tab === 'font' ? 'on' : ''} onClick={() => onTab('font')}>
              字体
            </button>
          </div>
          <button className="icon-btn sm" onClick={onClose} title="关闭 (Esc)">
            <X size={16} />
          </button>
        </div>

        {tab === 'accent' ? (
          <div className="picker-body">
            <div className="accent-grid">
              {ACCENTS.map((a) => (
                <button key={a.id} className={`accent-cell ${accent === a.id ? 'on' : ''}`} onClick={() => update({ accent: a.id })} title={a.name}>
                  <i style={{ background: accentColor(a, dark) }}>{accent === a.id && <Check size={14} strokeWidth={3} />}</i>
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
            <div className={`custom-accent ${customOn ? 'on' : ''}`}>
              <label className="custom-swatch" title="打开取色器" style={{ background: customShown }}>
                <input
                  type="color"
                  value={customAccent}
                  onInput={(e) => update({ customAccent: (e.target as HTMLInputElement).value, accent: CUSTOM_ID })}
                  aria-label="自定义强调色"
                />
                <Pipette size={14} />
              </label>
              <div className="custom-text">
                <span className="custom-label">自定义</span>
                <input
                  className="custom-hex"
                  type="text"
                  spellCheck={false}
                  value={hexDraft}
                  onChange={(e) => setHexDraft(e.target.value)}
                  onBlur={commitHex}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitHex()
                    e.stopPropagation()
                  }}
                  aria-label="十六进制颜色值"
                />
              </div>
              <button className="custom-use" onClick={() => update({ accent: CUSTOM_ID })} disabled={customOn}>
                {customOn ? <Check size={14} strokeWidth={3} /> : '使用'}
              </button>
            </div>
          </div>
        ) : (
          <div className="picker-body">
            <div className="font-list">
              {fonts.map((f) => (
                <button key={f.id} className={`font-cell ${font === f.id ? 'on' : ''}`} onClick={() => update({ font: f.id })}>
                  <span className="font-name">{f.name}</span>
                  <span className="font-sample" style={{ fontFamily: f.stack }}>
                    {SAMPLE}
                  </span>
                  {font === f.id && <Check className="font-check" size={16} strokeWidth={2.5} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
