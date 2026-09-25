export interface AccentOption {
  id: string
  name: string
  /** Nominal colour; the applied accent is tone-adjusted per theme so it stays readable. */
  hex: string
}

const RAW: [string, string][] = [
  // 红
  ['赭橙', '#c8551f'], ['朱砂', '#ff461f'], ['妃色', '#ed5736'], ['银红', '#f05654'], ['石榴红', '#f20c00'],
  ['茜色', '#cb3a56'], ['绯红', '#c93756'], ['海棠红', '#db5a6b'], ['胭脂', '#9d2933'], ['品红', '#f00056'],
  ['桃红', '#f47983'], ['嫣红', '#ef7a82'], ['洋红', '#ff4777'], ['枣红', '#8b3a3a'], ['酡红', '#dc3023'], ['绛', '#7a1f2b'],
  // 橙 · 黄
  ['朱红', '#ff4c00'], ['橘红', '#ff7500'], ['橙黄', '#ffa400'], ['杏黄', '#ffa631'], ['琥珀', '#ca6924'],
  ['赤金', '#f2be45'], ['藤黄', '#ffb61e'], ['姜黄', '#ffc773'], ['缃色', '#f0c239'], ['秋香', '#d9b611'],
  ['昏黄', '#c89b40'], ['枯黄', '#d3b17d'], ['鹅黄', '#e3c027'], ['金', '#c9a227'], ['驼色', '#a88462'],
  // 绿
  ['松绿', '#057748'], ['竹青', '#789262'], ['葱绿', '#7fb80e'], ['油绿', '#00bc12'], ['翠绿', '#0eb83a'],
  ['草绿', '#40b85a'], ['石绿', '#16a951'], ['豆绿', '#9ed048'], ['柳黄', '#a3b81e'], ['松花', '#8fbf4a'],
  ['艾绿', '#5aa47a'], ['铜绿', '#549688'], ['墨绿', '#2d5a4a'], ['黛绿', '#426666'], ['玉色', '#2ebf8c'],
  ['青碧', '#48c0a3'], ['苍色', '#75878a'], ['缥色', '#7fbfbf'],
  // 青 · 蓝
  ['碧色', '#1bd1a5'], ['石青', '#1685a9'], ['湖蓝', '#1fb0c9'], ['靛青', '#177cb0'], ['群青', '#4c8dae'],
  ['天青', '#2fa3a3'], ['碧蓝', '#2bb5b8'], ['蔚蓝', '#3b8fd6'], ['靛蓝', '#2b63b8'], ['宝蓝', '#4b5cc4'],
  ['藏蓝', '#26436e'], ['藏青', '#2e4e7e'], ['钴蓝', '#3949ab'], ['花青', '#1d4b8f'], ['绀青', '#3b4d7a'],
  ['黛蓝', '#425066'], ['蓝灰', '#6c7a99'], ['琉璃', '#2f6b8f'],
  // 紫
  ['紫', '#6f4bc4'], ['青莲', '#801dae'], ['紫棠', '#56004f'], ['丁香', '#9d7cc9'], ['雪青', '#8a7cc9'],
  ['酱紫', '#815476'], ['黛紫', '#574266'], ['紫酱', '#815463'], ['藕荷', '#a0527d'], ['兰紫', '#8e44ad'],
  ['紫檀', '#5a2d2f'],
  // 棕 · 灰 · 黑
  ['棕', '#7b4b2a'], ['檀', '#8c5a3c'], ['赭石', '#845a33'], ['茶色', '#b35c44'], ['栗色', '#60281e'],
  ['褐', '#6e511e'], ['黎', '#75664d'], ['秋色', '#896c39'], ['石墨', '#4a4f57'], ['乌黑', '#392f41'],
  ['缁', '#493131'], ['玄', '#1f1b16'],
]

export const ACCENTS: AccentOption[] = RAW.map(([name, hex], i) => ({ id: i === 0 ? 'orange' : `c${String(i).padStart(2, '0')}`, name, hex }))

export const CUSTOM_ID = 'custom'

export function accentById(id: string): AccentOption {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]
}

/** Resolves an accent id, including the user's own colour. */
export function accentFor(id: string, customHex: string): AccentOption {
  if (id === CUSTOM_ID) return { id: CUSTOM_ID, name: '自定义', hex: normalizeHex(customHex) ?? '#c8551f' }
  return accentById(id)
}

/** Accepts #rgb or #rrggbb (with or without #); returns lower-case #rrggbb or null. */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`
  return null
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
}

/** Keeps a custom colour as picked unless it would be unreadable; then darkens/lightens just enough. */
function readableCustom(hex: string, dark: boolean): string {
  const maxLight = 0.3 // on light backgrounds the accent must stay reasonably dark
  const minDark = 0.18 // on dark backgrounds it must stay reasonably bright
  const [h, s] = hexToHsl(hex)
  let l = hexToHsl(hex)[2]
  let out = hex
  for (let i = 0; i < 60; i++) {
    const y = luminance(out)
    if (dark ? y >= minDark : y <= maxLight) break
    l = clamp(l + (dark ? 0.02 : -0.02), 0.02, 0.98)
    out = hslToHex(h, s, l)
  }
  return out
}

/**
 * The colour actually applied for a theme: dark enough to read as text on light backgrounds,
 * bright enough on dark ones, hue preserved.
 */
export function accentColor(a: AccentOption, dark: boolean): string {
  if (a.id === CUSTOM_ID) return readableCustom(a.hex, dark)
  const [h, s, l] = hexToHsl(a.hex)
  const neutral = s < 0.12
  const L = dark ? clamp(l, 0.62, 0.74) : clamp(l, 0.27, 0.45)
  const S = neutral ? s : clamp(s, 0.3, dark ? 0.8 : 0.9)
  return hslToHex(h, S, L)
}
