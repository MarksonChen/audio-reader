export interface FontOption {
  id: string
  name: string
  /** Family name(s) to test for local availability; null means always available. */
  probe: string | string[] | null
  stack: string
}

const SERIF_FALLBACK = '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", "SimSun", serif'
const SANS_FALLBACK = '"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'

export const FONTS: FontOption[] = [
  { id: 'serif', name: '宋体', probe: 'Songti SC', stack: SERIF_FALLBACK },
  { id: 'sans', name: '苹方', probe: 'PingFang SC', stack: SANS_FALLBACK },
  { id: 'kai', name: '楷体', probe: 'Kaiti SC', stack: `"Kaiti SC", "STKaiti", "KaiTi", "AR PL UKai CN", ${SERIF_FALLBACK}` },
  { id: 'fangsong', name: '仿宋', probe: 'STFangsong', stack: `"STFangsong", "FangSong", "FangSong_GB2312", ${SERIF_FALLBACK}` },
  { id: 'heiti', name: '华文黑体', probe: ['Heiti SC', 'STHeiti'], stack: `"Heiti SC", "STHeiti", "SimHei", ${SANS_FALLBACK}` },
  { id: 'xihei', name: '华文细黑', probe: 'STXihei', stack: `"STXihei", "Heiti SC", ${SANS_FALLBACK}` },
  { id: 'hiragino', name: '冬青黑体', probe: 'Hiragino Sans GB', stack: `"Hiragino Sans GB", ${SANS_FALLBACK}` },
  { id: 'yuanti', name: '圆体', probe: 'Yuanti SC', stack: `"Yuanti SC", "Yuanti TC", ${SANS_FALLBACK}` },
  { id: 'lantinghei', name: '兰亭黑', probe: 'Lantinghei SC', stack: `"Lantinghei SC", ${SANS_FALLBACK}` },
  { id: 'wenkai', name: '霞鹜文楷', probe: ['LXGW WenKai GB Screen R', 'LXGW WenKai GB Screen', 'LXGW WenKai Screen', 'LXGW WenKai', 'LXGW WenKai GB'], stack: `"LXGW WenKai GB Screen R", "LXGW WenKai GB Screen", "LXGW WenKai Screen", "LXGW WenKai", "LXGW WenKai GB", "Kaiti SC", ${SERIF_FALLBACK}` },
  { id: 'wenkaimono', name: '霞鹜文楷等宽', probe: 'LXGW WenKai Mono', stack: `"LXGW WenKai Mono", "LXGW WenKai", ${SERIF_FALLBACK}` },
  { id: 'xingkai', name: '行楷', probe: 'Xingkai SC', stack: `"Xingkai SC", "Kaiti SC", ${SERIF_FALLBACK}` },
  { id: 'hannotate', name: '手札体', probe: 'Hannotate SC', stack: `"Hannotate SC", "Kaiti SC", ${SERIF_FALLBACK}` },
  { id: 'hanzipen', name: '翩翩体', probe: 'Hanzipen SC', stack: `"Hanzipen SC", "Kaiti SC", ${SERIF_FALLBACK}` },
  { id: 'wawati', name: '娃娃体', probe: 'Wawati SC', stack: `"Wawati SC", ${SANS_FALLBACK}` },
  { id: 'libian', name: '隶变', probe: 'Libian SC', stack: `"Libian SC", ${SERIF_FALLBACK}` },
  { id: 'baoli', name: '报隶', probe: 'Baoli SC', stack: `"Baoli SC", ${SERIF_FALLBACK}` },
  { id: 'weibei', name: '魏碑', probe: 'Weibei SC', stack: `"Weibei SC", ${SERIF_FALLBACK}` },
  { id: 'yuppy', name: '雅痞', probe: 'Yuppy SC', stack: `"Yuppy SC", ${SANS_FALLBACK}` },
  { id: 'notoserif', name: '思源宋体', probe: ['Noto Serif CJK SC', 'Noto Serif SC', 'Source Han Serif SC'], stack: `"Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", ${SERIF_FALLBACK}` },
  { id: 'notosans', name: '思源黑体', probe: ['Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC'], stack: `"Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", ${SANS_FALLBACK}` },
  { id: 'georgia', name: 'Georgia · 宋', probe: 'Georgia', stack: `Georgia, ${SERIF_FALLBACK}` },
  { id: 'palatino', name: 'Palatino · 宋', probe: 'Palatino', stack: `Palatino, "Palatino Linotype", ${SERIF_FALLBACK}` },
  { id: 'charter', name: 'Charter · 宋', probe: 'Charter', stack: `Charter, ${SERIF_FALLBACK}` },
  { id: 'iowan', name: 'Iowan Old Style · 宋', probe: 'Iowan Old Style', stack: `"Iowan Old Style", ${SERIF_FALLBACK}` },
  { id: 'baskerville', name: 'Baskerville · 宋', probe: 'Baskerville', stack: `Baskerville, ${SERIF_FALLBACK}` },
  { id: 'uiserif', name: '系统衬线 · 宋', probe: null, stack: `ui-serif, ${SERIF_FALLBACK}` },
  { id: 'helvetica', name: 'Helvetica · 苹方', probe: 'Helvetica Neue', stack: `"Helvetica Neue", Helvetica, ${SANS_FALLBACK}` },
  { id: 'avenir', name: 'Avenir · 苹方', probe: 'Avenir Next', stack: `"Avenir Next", Avenir, ${SANS_FALLBACK}` },
  { id: 'menlo', name: 'Menlo 等宽 · 苹方', probe: 'Menlo', stack: `Menlo, ${SANS_FALLBACK}` },
  { id: 'dinglie', name: '鼎猎宋刻体', probe: ['鼎猎宋刻体', 'dingliesongtypeface'], stack: `"鼎猎宋刻体", "dingliesongtypeface", ${SERIF_FALLBACK}` },
  { id: 'jinghao', name: '静好如歌', probe: ['静好如歌', 'SYJHRG'], stack: `"静好如歌", "SYJHRG", "Kaiti SC", ${SERIF_FALLBACK}` },
]

export function fontById(id: string): FontOption {
  return FONTS.find((f) => f.id === id) ?? FONTS[0]
}

const cache = new Map<string, boolean>()
const SAMPLE = '边听边读 Audio Reader 0123'

function familyAvailable(family: string): boolean {
  const hit = cache.get(family)
  if (hit !== undefined) return hit
  let ok = true
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ok = ['monospace', 'serif', 'sans-serif'].some((generic) => {
        ctx.font = `48px ${generic}`
        const base = ctx.measureText(SAMPLE).width
        ctx.font = `48px "${family}", ${generic}`
        return ctx.measureText(SAMPLE).width !== base
      })
    }
  } catch {
    ok = true
  }
  cache.set(family, ok)
  return ok
}

/** True when at least one of the option's probe families is installed. */
export function isFontAvailable(font: FontOption): boolean {
  if (font.probe === null) return true
  const probes = Array.isArray(font.probe) ? font.probe : [font.probe]
  return probes.some(familyAvailable)
}
