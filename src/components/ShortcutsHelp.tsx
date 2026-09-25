import { X } from 'lucide-react'
import { KEYS } from '../lib/platform'
import { closeOnEscape } from '../lib/keys'

function rows(skip: number): [string, string][] {
  const fine = skip <= 5 ? 1 : 5
  const { mod, alt, shift, joiner } = KEYS
  return [
    ['空格 / K', '播放 / 暂停'],
    ['← / →', `后退 / 前进 ${skip} 秒`],
    [`${shift}${joiner}← / →`, `后退 / 前进 ${fine} 秒`],
    [`${alt}${joiner}← / →`, '上一句 / 下一句'],
    [`${alt}${joiner}↑ / ↓`, '上一段 / 下一段'],
    [`${mod}${joiner}F 或 /`, '搜索正文'],
    ['[ / ]', `减速 / 加速 0.05（${shift} 为 0.25）`],
    ['- / =', '缩小 / 放大字号'],
    ['F', '开关自动跟随'],
    ['M', '静音 / 取消静音'],
    ['Z', '专注阅读，隐藏上下栏（Esc 退出）'],
    ['Enter', '回到当前句'],
    [`${mod}${joiner},`, '阅读设置'],
    ['?', '本帮助'],
  ]
}

export function ShortcutsHelp({ skipSeconds, onClose }: { skipSeconds: number; onClose: () => void }) {
  const ROWS = rows(skipSeconds)
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="panel help" role="dialog" aria-label="快捷键" onKeyDown={closeOnEscape(onClose)}>
        <div className="panel-head">
          <span>快捷键</span>
          <button className="icon-btn sm" onClick={onClose} title="关闭 (Esc)">
            <X size={16} />
          </button>
        </div>
        <table className="keys">
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
