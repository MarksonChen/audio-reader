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
scripts/       align.py：普通字幕 → 逐词字幕的命令行工具（uv 脚本，见下）
public/demo    示例：24k Opus 音频、ASR 字幕、原稿、逐词字幕（.words.srt）
```

## 工作原理

- **字幕 → 时间轴**：解析字幕后把所有 cue 摊平成一条「字符流」，每个字符按说话速度插值出一个时间。
  ASR 字幕常把一条 cue 截到固定时长（示例里是 7 秒），这里会按估计语速把 cue 拉伸到下一条 cue 开始前。
- **原稿 → 对齐**：原稿与字幕各自归一化（只保留字母 / 数字，NFKC + 小写），
  用 [diff-match-patch](https://github.com/google/diff-match-patch) 做字符级 diff，
  连续 3 个字以上的相同片段作为锚点，其余字符在锚点之间线性插值。对齐在 Web Worker 中运行，30 分钟音频约 20 毫秒。
- **分句**：按 。！？；… 等切句，过长的句子在逗号处二次切分；Markdown 标题会当作小标题显示。
- **没有原稿时**：直接用字幕文字成文，按停顿与句末标点自动分段。原稿匹配率低于 20% 时也退回这个模式。
- **逐词字幕 / 词级 JSON**：每个词自带精确起止时间，跳过语速拉伸，只在词内部插值，按字点亮平滑推进。
- **渲染**：当前句激活时一次性拆成单字 span，之后每帧只改颜色，不改动任何文本节点
  （早先每帧搬动文本节点的做法会在部分环境里让字形间歇性上移几个像素）。
- **时长**：解码波形时得到精确时长；与 `<audio>` 报的值相差超过 1 秒就以解码值为准（Safari 会把 Ogg Opus 的时长估算偏大约 5%）。
- **存储**：文件与进度存 IndexedDB（`idb-keyval`），设置存 localStorage（带版本迁移）。

## 逐词字幕（stable-ts 强制对齐）

`scripts/align.py` 是一个自包含的 uv 脚本（PEP 723 内联依赖），输入音频加一份文字来源，输出逐词 SRT：

```bash
uv run scripts/align.py 音频.mp3 字幕.srt              # 文字来源可以是 srt / vtt / lrc
uv run scripts/align.py 音频.mp3 原稿.txt --model medium   # 或 txt / md 原稿
uv run scripts/align.py --help
```

- 它调用 [stable-ts](https://github.com/jianfch/stable-ts) 的 `align()`：不做识别，只回答“文字里的每个词在第几毫秒说出”。
  文字与音频有出入时（原稿多几个字、少几个字）会被跳过或压缩，不会整体错位。
- 字幕作为来源时，先剥掉序号与时间戳，把各条文字重新连成整段，让对齐器自己按标点分段
  （ASR 字幕常在句中硬切行，按行分段会让对齐质量明显变差：示例里零时长词从 783 降到 216）。
  原稿作为来源时按行分段。
- 输出的 `.words.srt` 每个词一条；网页会按“每条只有一两个词、时长很短”自动识别为逐词字幕，进入逐字模式。
  网页另外也接受词级 JSON（兼容 whisper / stable-ts 的 `segments[].words[]` 结构）。
- 模型默认 `small`。在示例音频上，`medium` 慢 3 倍多、零时长词反而更多，与 `small` 的词起点中位数只差 80 毫秒，
  对照 ASR 边界与音频能量起点都没有更准，所以不必升级模型。small 的时间戳相对真实发声整体晚约 50 到 100 毫秒，
  需要的话在设置里把「高亮偏移」调到 +0.10 秒。
- 30 分钟音频在 M4 Pro 上约 45 到 70 秒；首次运行 uv 会创建环境并下载模型（small 约 460 MB）。

> 若系统里有 conda 的 Python 被选中，torch 可能报 `OMP: Error #15`（两份 OpenMP 运行时）。
> 加 `UV_PYTHON_PREFERENCE=only-managed` 让 uv 使用自管的解释器即可。

## 高亮的两种模式

- **逐词字幕**（`stats.precise`）：当前句拆成单字 span，已读的字为强调色，正在读的字按其时长渐变。
- **普通字幕**：每个原稿字符记住它属于哪一条字幕（对齐锚点所在的 cue，未锚定的字符取最近锚点的 cue）；
  当前时间落在哪条字幕，就把属于它及之前各条的字符整块变为强调色，没有字内渐变。点击字符跳到该条字幕的起点。

## 调试

- URL 加 `&debug=1`（如 `/?demo&debug=1`）显示一个面板，逐帧测量正在读的字与邻字的字形位置，用于排查高亮渲染问题。
- 浏览器实测用 Playwright 驱动本机 Chrome（`channel: 'chrome'`）；Safari 引擎可用一个基于 WKWebView 的
  Swift 小程序离屏加载页面、执行 JS 并截图，不依赖 Playwright 的 WebKit 下载。
