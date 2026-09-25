# 开发者说明

面向想在本地运行、修改或为音频生成精确时间轴的人。普通使用见 [README.md](README.md)。

## 本地运行

```bash
npm install
npm run dev        # http://localhost:5173，加 ?demo 直接进入示例
npm run build      # 产物在 dist/，任何静态服务器都能托管
npm run lint       # oxlint
```

技术栈：Vite 8、React 19、TypeScript、zustand、idb-keyval、diff-match-patch、lucide-react。没有后端。

## 部署（GitHub Pages）

推送到 `main` 会触发 `.github/workflows/pages.yml`：`npm ci && npm run build`，然后发布 `dist/`。
构建时通过 `BASE_PATH=/<仓库名>/` 设置 Vite 的 `base`，所以本地开发仍是 `/`。
仓库 Settings → Pages 的 Source 需要是「GitHub Actions」。

## 目录

```
src/lib        字幕解析、归一化、分句、对齐、字体 / 颜色目录、存储、波形峰值
src/store      zustand 状态：播放器、会话、阅读设置
src/components 首页、阅读器、正文、播放器、波形、设置面板、颜色 / 字体选择、搜索
scripts/       align.py：stable-ts 强制对齐脚本（Python，见下）
public/demo    示例：24k Opus 音频、ASR 字幕、原稿、词级时间 JSON
```

## 工作原理

- **字幕 → 时间轴**：解析字幕后把所有 cue 摊平成一条「字符流」，每个字符按说话速度插值出一个时间。
  ASR 字幕常把一条 cue 截到固定时长（示例里是 7 秒），这里会按估计语速把 cue 拉伸到下一条 cue 开始前。
- **原稿 → 对齐**：原稿与字幕各自归一化（只保留字母 / 数字，NFKC + 小写），
  用 [diff-match-patch](https://github.com/google/diff-match-patch) 做字符级 diff，
  连续 3 个字以上的相同片段作为锚点，其余字符在锚点之间线性插值。对齐在 Web Worker 中运行，30 分钟音频约 20 毫秒。
- **分句**：按 。！？；… 等切句，过长的句子在逗号处二次切分；Markdown 标题会当作小标题显示。
- **没有原稿时**：直接用字幕文字成文，按停顿与句末标点自动分段。原稿匹配率低于 20% 时也退回这个模式。
- **词级 JSON**：每个词自带精确起止时间，跳过语速拉伸，只在词内部插值，按字点亮平滑推进。
- **渲染**：当前句激活时一次性拆成单字 span，之后每帧只改颜色，不改动任何文本节点
  （早先每帧搬动文本节点的做法会在部分环境里让字形间歇性上移几个像素）。
- **时长**：解码波形时得到精确时长；与 `<audio>` 报的值相差超过 1 秒就以解码值为准（Safari 会把 Ogg Opus 的时长估算偏大约 5%）。
- **存储**：文件与进度存 IndexedDB（`idb-keyval`），设置存 localStorage（带版本迁移）。

## 精确对齐（stable-ts）

字幕只能给出每条 cue 的起止时间，cue 内部的字是按语速插值的，会有零点几秒到一两秒的偏差。
`scripts/align.py` 调用 [stable-ts](https://github.com/jianfch/stable-ts) 的 `align()` 做强制对齐：
不做识别，只回答“原稿里每个字是在第几毫秒说的”。

```bash
# 一次性准备环境（约 1 分钟；模型首次运行会再下载 ~460 MB）
uv venv --python 3.12 scripts/.venv
uv pip install --python scripts/.venv/bin/python stable-ts

# 对齐：输入音频 + 原稿，输出词级 JSON
scripts/.venv/bin/python scripts/align.py 音频.mp3 原稿.txt -o 音频.words.json --model small
```

把生成的 `*.words.json` 放到首页的「字幕」槽位（原稿槽位仍放 TXT）。JSON 也兼容 whisper / stable-ts 自带的
`segments[].words[]` 结构。`--srt` 会额外输出一份词级 SRT 方便检查。

模型默认 `small`。在示例音频上，`medium` 慢 3 倍多、零时长词反而更多，与 `small` 的词起点中位数只差 80 毫秒，
对照 ASR 边界与音频能量起点都没有更准，所以不必升级模型。small 的时间戳相对真实发声整体晚约 50 到 100 毫秒，
需要的话在设置里把「高亮偏移」调到 +0.10 秒。

> 如果 uv 选到了 conda 的 Python，torch 可能报 `OMP: Error #15`（两份 OpenMP 运行时）。
> 用 `uv venv --python 3.12.9`（uv 自管的解释器）重建即可。

## 调试

- URL 加 `&debug=1`（如 `/?demo&debug=1`）显示一个面板，逐帧测量正在读的字与邻字的字形位置，用于排查高亮渲染问题。
- 浏览器实测用 Playwright 驱动本机 Chrome（`channel: 'chrome'`）；Safari 引擎可用一个基于 WKWebView 的
  Swift 小程序离屏加载页面、执行 JS 并截图，不依赖 Playwright 的 WebKit 下载。
