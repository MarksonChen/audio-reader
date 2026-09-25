#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["stable-ts>=2.19"]
# ///
"""把普通字幕（或原稿）变成逐词字幕。

给定音频和一份文字来源（SRT / VTT / LRC 字幕，或 TXT / Markdown 原稿），用 stable-ts 做强制对齐：
不做语音识别，只回答“文字里的每个词是在第几毫秒说出来的”，然后写出：

  <音频名>.words.srt   逐词字幕（每个词一条），放进 Audio Reader 的「字幕」槽位即可获得逐字渐变
  <音频名>.words.json  同样的数据，JSON 形式

用法（需要先安装 uv：https://docs.astral.sh/uv/ ）：

    uv run scripts/align.py 音频.mp3 字幕.srt
    uv run scripts/align.py 音频.mp3 原稿.txt --model medium

首次运行会自动准备 Python 环境并下载模型（small 约 460 MB）。30 分钟音频在 M 系列 Mac 上约 1 分钟。
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import time

SUBTITLE_EXT = {".srt", ".vtt", ".lrc", ".sbv"}
TIME_LINE = re.compile(r"\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}\s*-->")
LRC_TAG = re.compile(r"\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]")
HTML_TAG = re.compile(r"<[^>]+>|\{\\[^}]*\}")


def subtitle_to_lines(raw: str) -> list[str]:
    """Drops indices, timestamps and tags; keeps one line of text per cue."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    if LRC_TAG.search(text) and "-->" not in text:
        lines = []
        for line in text.split("\n"):
            body = LRC_TAG.sub("", line).strip()
            if body and LRC_TAG.match(line):
                lines.append(body)
        return lines
    lines: list[str] = []
    for block in re.split(r"\n[ \t]*\n+", text.strip()):
        rows = block.split("\n")
        if not any(TIME_LINE.search(r) for r in rows):
            continue  # WEBVTT header, NOTE blocks and the like
        start = next(i for i, r in enumerate(rows) if TIME_LINE.search(r))
        body = " ".join(HTML_TAG.sub("", r).strip() for r in rows[start + 1 :])
        body = re.sub(r"\s+", " ", body).strip()
        if body:
            lines.append(body)
    return lines


def load_text(path: pathlib.Path) -> tuple[str, str]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "gb18030", "utf-16"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", errors="replace")
    if path.suffix.lower() in SUBTITLE_EXT or "-->" in text[:2000]:
        # Subtitle cues are often cut mid-sentence (ASR wraps lines), so they are joined back into
        # running text and the aligner splits it by punctuation itself.
        joined = ""
        for line in subtitle_to_lines(text):
            if joined and joined[-1].isascii() and joined[-1].isalnum() and line[0].isascii() and line[0].isalnum():
                joined += " "
            joined += line
        return joined, "subtitle"
    return text, "transcript"


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio", help="音频文件（mp3 / m4a / wav / opus … ffmpeg 能读的都行）")
    ap.add_argument("text", help="字幕（srt / vtt / lrc）或原稿（txt / md）")
    ap.add_argument("-o", "--out", help="输出文件名前缀（默认与音频同名，写出 .words.srt 和 .words.json）")
    ap.add_argument("--model", default="small", help="whisper 模型：tiny / base / small / medium / large-v3（默认 small）")
    ap.add_argument("--device", default="cpu", help="cpu、cuda 或 mps（默认 cpu）")
    ap.add_argument("--language", default="zh", help="文字的语言代码（默认 zh）")
    args = ap.parse_args()

    audio = pathlib.Path(args.audio)
    text_path = pathlib.Path(args.text)
    if not audio.exists() or not text_path.exists():
        print("找不到输入文件", file=sys.stderr)
        return 1
    text, kind = load_text(text_path)
    if not text.strip():
        print("文字来源是空的", file=sys.stderr)
        return 1
    out_base = pathlib.Path(args.out) if args.out else audio.with_suffix("")
    out_srt = out_base.with_name(out_base.name + ".words.srt")
    out_json = out_base.with_name(out_base.name + ".words.json")

    import stable_whisper  # 延迟导入，让 --help 保持快速

    t0 = time.time()
    print(f"文字来源：{text_path.name}（{'字幕' if kind == 'subtitle' else '原稿'}，{len(text)} 字符）")
    print(f"加载模型 {args.model!r}（{args.device}）…", flush=True)
    model = stable_whisper.load_model(args.model, device=args.device)
    print(f"对齐 {audio.name} …", flush=True)
    # A transcript's own lines are good segment boundaries; subtitle text is split by punctuation instead.
    result = model.align(str(audio), text, language=args.language, original_split=(kind == "transcript"), verbose=False)

    words = []
    for seg in result.segments:
        for w in seg.words:
            wt = w.word.strip()
            if wt:
                words.append({"text": wt, "start": round(float(w.start), 3), "end": round(float(w.end), 3), "p": round(float(w.probability), 3)})
    if not words:
        print("对齐失败：没有得到任何词", file=sys.stderr)
        return 2

    lines = []
    for i, w in enumerate(words):
        end = w["end"]
        if end <= w["start"]:
            end = words[i + 1]["start"] if i + 1 < len(words) and words[i + 1]["start"] > w["start"] else w["start"] + 0.05
        lines.append(f"{i + 1}\n{srt_time(w['start'])} --> {srt_time(end)}\n{w['text']}\n")
    out_srt.write_text("\n".join(lines), encoding="utf-8")
    out_json.write_text(
        json.dumps(
            {
                "format": "audio-reader-words",
                "version": 1,
                "source": "stable-ts",
                "model": args.model,
                "language": args.language,
                "audio": audio.name,
                "text": text_path.name,
                "words": words,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    zero = sum(1 for w in words if w["end"] <= w["start"])
    print(f"完成，用时 {time.time() - t0:.0f} 秒：{len(words)} 个词，零时长 {zero} 个，最后一个词结束于 {words[-1]['end']:.1f} 秒")
    print(f"已写出 {out_srt}")
    print(f"已写出 {out_json}")
    print("把 .words.srt（或 .words.json）放进 Audio Reader 的「字幕」槽位，即可获得逐字渐变。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
