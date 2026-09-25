import { X } from 'lucide-react'

function rows(skip: number): [string, string][] {
  const fine = skip <= 5 ? 1 : 5
  return [
    ['空格 / K', '播放 / 暂停'],
    ['← / →', `后退 / 前进 ${skip} 秒`],
    ['⇧ + ← / →', `后退 / 前进 ${fine} 秒`],
    ['⌥ + ← / →', '上一句 / 下一句'],
    ['⌥ + ↑ / ↓', '上一段 / 下一段'],
    ['⌘F 或 /', '搜索正文'],
    ['[ / ]', '减速 / 加速 0.05（⇧ 为 0.25）'],
    ['- / =', '缩小 / 放大字号'],
    ['F', '开关自动跟随'],
    ['Z', '专注阅读，隐藏上下栏（Esc 退出）'],
    ['Enter', '回到当前句'],
    ['⌘ / Ctrl + ,', '阅读设置'],
    ['?', '本帮助'],
  ]
}

export function ShortcutsHelp({ skipSeconds, onClose }: { skipSeconds: number; onClose: () => void }) {
  const ROWS = rows(skipSeconds)
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="panel help" role="dialog" aria-label="快捷键">
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
        <p className="modal-note">点击任意一句（甚至一个字）都会跳到对应的时间。拖动波形可以快速定位。</p>
        <p className="modal-note">触屏：在正文上左右滑动前后跳，双击播放 / 暂停，从播放器向上滑呼出设置。</p>
      </div>
    </>
  )
}
