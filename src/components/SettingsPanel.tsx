import { ChevronRight, Coffee, Monitor, Moon, Sun, X } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { accentColor, accentFor } from '../lib/accents'
import { closeOnEscape } from '../lib/keys'
import { fontById } from '../lib/fonts'
import type { PickerTab } from './AppearancePicker'
import {
  DEFAULT_SETTINGS,
  FONT_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
  MEASURE_RANGE,
  OFFSET_RANGE,
  RATE_SLIDER_RANGE,
  SKIP_OPTIONS,
  useSettings,
  resolveTheme,
  type FollowAnchor,
  type FollowUnit,
  type HighlightStyle,
  type SentenceEnd,
  type Theme,
} from '../store/settings'
import { RATE_STEP, fmtRate, usePlayer } from '../store/player'

type IconType = ComponentType<{ size?: number }>

interface Option<T extends string> {
  id: T
  label: string
  Icon?: IconType
}

const THEMES: Option<Theme>[] = [
  { id: 'system', label: '跟随系统', Icon: Monitor },
  { id: 'light', label: '浅色', Icon: Sun },
  { id: 'sepia', label: '纸张', Icon: Coffee },
  { id: 'dark', label: '深色', Icon: Moon },
]
const HIGHLIGHTS: Option<HighlightStyle>[] = [
  { id: 'background', label: '底色' },
  { id: 'underline', label: '下划线' },
  { id: 'none', label: '仅变色' },
]
const ANCHORS: Option<FollowAnchor>[] = [
  { id: 'top', label: '靠上' },
  { id: 'center', label: '居中' },
  { id: 'bottom', label: '靠下' },
]
const UNITS: Option<FollowUnit>[] = [
  { id: 'sentence', label: '逐句' },
  { id: 'paragraph', label: '逐段' },
]
const ENDINGS: Option<SentenceEnd>[] = [
  { id: 'continue', label: '继续' },
  { id: 'pause', label: '暂停' },
  { id: 'repeat', label: '重复' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sec">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="row-ctl" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  )
}


function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}

function Seg<T extends string>({ value, options, onChange, icons }: { value: T; options: Option<T>[]; onChange: (v: T) => void; icons?: boolean }) {
  return (
    <div className={`seg ${icons ? 'icons' : ''}`}>
      {options.map(({ id, label, Icon }) => (
        <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)} title={label} aria-pressed={value === id}>
          {Icon && <Icon size={14} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

interface SliderProps {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  defaultValue: number
  format: (v: number) => string
  onChange: (v: number) => void
}

/** Label and value on one line, a full-width slider below; double-click restores the default. */
function SliderRow({ label, hint, value, min, max, step, defaultValue, format, onChange }: SliderProps) {
  const v = Math.min(max, Math.max(min, value))
  const p = ((v - min) / (max - min)) * 100
  return (
    <div className="row slider-row">
      <div className="row-top">
        <div className="row-label">
          {label}
          {hint && <small>{hint}</small>}
        </div>
        <span className="value">{format(value)}</span>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        style={{ ['--p' as string]: `${p}%` }}
        title="双击恢复默认"
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') e.stopPropagation() // arrows adjust the slider; Escape still closes the panel
        }}
        aria-label={label}
      />
    </div>
  )
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

export function SettingsPanel({ onClose, onPick }: { onClose: () => void; onPick: (tab: PickerTab) => void }) {
  const s = useSettings()
  const update = s.update
  const accent = accentFor(s.accent, s.customAccent)
  const accentHex = accentColor(accent, resolveTheme(s.theme) === 'dark')
  const fontName = fontById(s.font).name
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="panel" role="dialog" aria-label="阅读设置" onKeyDown={closeOnEscape(onClose)}>
        <div className="panel-head">
          <span>阅读设置</span>
          <button className="icon-btn sm" onClick={onClose} title="关闭 (Esc)">
            <X size={16} />
          </button>
        </div>

        <Section title="外观">
          <Row label="主题">
            <Seg value={s.theme} options={THEMES} onChange={(v) => update({ theme: v })} icons />
          </Row>
          <Row label="强调色">
            <button className="pick" onClick={() => onPick('accent')}>
              <i className="dot" style={{ background: accentHex }} />
              {accent.name}
              <ChevronRight size={14} />
            </button>
          </Row>
        </Section>

        <Section title="排版">
          <Row label="字体">
            <button className="pick" onClick={() => onPick('font')}>
              {fontName}
              <ChevronRight size={14} />
            </button>
          </Row>
          <SliderRow
            label="字号"
            hint="快捷键 - / ="
            value={s.fontSize}
            min={FONT_SIZE_RANGE.min}
            max={FONT_SIZE_RANGE.max}
            step={1}
            defaultValue={DEFAULT_SETTINGS.fontSize}
            format={(v) => `${v}px`}
            onChange={(v) => update({ fontSize: Math.round(v) })}
          />
          <SliderRow
            label="行距"
            value={s.lineHeight}
            min={LINE_HEIGHT_RANGE.min}
            max={LINE_HEIGHT_RANGE.max}
            step={0.05}
            defaultValue={DEFAULT_SETTINGS.lineHeight}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update({ lineHeight: round(v) })}
          />
          <SliderRow
            label="页宽"
            value={s.measure === 0 ? MEASURE_RANGE.max : s.measure}
            min={MEASURE_RANGE.min}
            max={MEASURE_RANGE.max}
            step={1}
            defaultValue={DEFAULT_SETTINGS.measure}
            format={(v) => (v >= MEASURE_RANGE.max ? '全宽' : `约 ${Math.max(10, Math.round((v * 16 - 56) / s.fontSize))} 字/行`)}
            onChange={(v) => update({ measure: v >= MEASURE_RANGE.max ? 0 : Math.round(v) })}
          />
          <Row label="两端对齐">
            <Switch on={s.justify} onChange={(v) => update({ justify: v })} />
          </Row>
          <Row label="段首缩进">
            <Switch on={s.indent} onChange={(v) => update({ indent: v })} />
          </Row>
        </Section>

        <Section title="高亮">
          <Row label="当前句样式">
            <Seg value={s.highlightStyle} options={HIGHLIGHTS} onChange={(v) => update({ highlightStyle: v })} />
          </Row>
          <Row label="已读句子变灰">
            <Switch on={s.dimPast} onChange={(v) => update({ dimPast: v })} />
          </Row>
          <Row label="淡化其他段落">
            <Switch on={s.dimOthers} onChange={(v) => update({ dimOthers: v })} />
          </Row>
          <SliderRow
            label="高亮偏移"
            hint="文字比声音慢就调大，快就调小"
            value={s.offset}
            min={OFFSET_RANGE.min}
            max={OFFSET_RANGE.max}
            step={0.05}
            defaultValue={DEFAULT_SETTINGS.offset}
            format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}s`}
            onChange={(v) => update({ offset: round(v) })}
          />
        </Section>

        <Section title="跟随">
          <Row label="打开时自动跟随">
            <Switch on={s.autoFollow} onChange={(v) => update({ autoFollow: v })} />
          </Row>
          <Row label="当前句停靠位置">
            <Seg value={s.followAnchor} options={ANCHORS} onChange={(v) => update({ followAnchor: v })} />
          </Row>
          <Row label="跟随单位">
            <Seg value={s.followUnit} options={UNITS} onChange={(v) => update({ followUnit: v })} />
          </Row>
          <Row label="平滑滚动">
            <Switch on={s.smoothScroll} onChange={(v) => update({ smoothScroll: v })} />
          </Row>
        </Section>

        <Section title="播放">
          <Row label="快进快退" hint="按钮与 ← → 的步长">
            <Seg
              value={String(s.skipSeconds)}
              options={SKIP_OPTIONS.map((n) => ({ id: String(n), label: `${n}s` }))}
              onChange={(v) => update({ skipSeconds: Number(v) })}
            />
          </Row>
          <Row label="每句结束时" hint="暂停或重复，适合精听与跟读">
            <Seg value={s.sentenceEnd} options={ENDINGS} onChange={(v) => update({ sentenceEnd: v })} />
          </Row>
          <Row label="点击句子后播放">
            <Switch on={s.playOnClick} onChange={(v) => update({ playOnClick: v })} />
          </Row>
          <SliderRow
            label="倍速"
            hint="不设上限"
            value={s.rate}
            min={RATE_SLIDER_RANGE.min}
            max={RATE_SLIDER_RANGE.max}
            step={RATE_STEP}
            defaultValue={DEFAULT_SETTINGS.rate}
            format={fmtRate}
            onChange={(v) => usePlayer.getState().setRate(v)}
          />
        </Section>

        <Section title="显示">
          <Row label="段落时间戳">
            <Switch on={s.showTimestamps} onChange={(v) => update({ showTimestamps: v })} />
          </Row>
          <Row label="播放器波形">
            <Switch on={s.showWave} onChange={(v) => update({ showWave: v })} />
          </Row>
        </Section>

        <div className="panel-foot">
          <span className="version">Audio Reader v{__APP_VERSION__}</span>
          <button
            className="link"
            onClick={() => {
              update(DEFAULT_SETTINGS)
              usePlayer.getState().setRate(DEFAULT_SETTINGS.rate)
            }}
          >
            恢复默认
          </button>
        </div>
      </div>
    </>
  )
}
