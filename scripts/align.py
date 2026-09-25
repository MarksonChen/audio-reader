#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["stable-ts>=2.19"]
# ///
"""把普通字幕（或原稿）变成逐词字幕。

给定音频和一份文字来源（SRT / VTT / LRC 字幕，或 TXT / Markdown 原稿），用 stable-ts 做强制对齐：
不做语音识别，只回答“文字里的每个词是在第几毫秒说出来的”，然后写出：

  <音频名>.words.srt   逐词字幕（每个词一条），放进 Audio Reader 的「字幕」槽位即可获得逐字渐变

用法（需要先安装 uv：https://docs.astral.sh/uv/ ）：

    uv run scripts/align.py 音频.mp3 字幕.srt
    uv run scripts/align.py 音频.mp3 原稿.txt --model medium

首次运行会自动准备 Python 环境并下载模型（small 约 460 MB）。30 分钟音频在 M 系列 Mac 上约 1 分钟。
"""
from __future__ import annotations

import argparse
import pathlib
import re
import shutil
import sys
import time
import unicodedata

SUBTITLE_EXT = {".srt", ".vtt", ".lrc", ".sbv"}
TIME_LINE = re.compile(r"\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}\s*-->")
# YouTube SBV: `0:00:00.000,0:00:05.000`
SBV_LINE = re.compile(r"^\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*,\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*$")
MODELS = ["tiny", "base", "small", "medium", "large", "large-v2", "large-v3", "turbo"]
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
    is_time = lambda r: bool(TIME_LINE.search(r) or SBV_LINE.match(r))
    for block in re.split(r"\n[ \t]*\n+", text.strip()):
        rows = block.split("\n")
        if not any(is_time(r) for r in rows):
            continue  # WEBVTT header, NOTE blocks and the like
        start = next(i for i, r in enumerate(rows) if is_time(r))
        body = " ".join(HTML_TAG.sub("", r).strip() for r in rows[start + 1 :])
        body = re.sub(r"\s+", " ", body).strip()
        if body:
            lines.append(body)
    return lines


def decode_text(raw: bytes) -> str:
    # BOM-less UTF-16 is full of NUL bytes and would otherwise pass as UTF-8 (then read as empty text).
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff") or b"\x00" in raw[:4096]:
        return raw.decode("utf-16")
    for enc in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def is_wide(ch: str) -> bool:
    return unicodedata.east_asian_width(ch) in ("W", "F")


def load_text(path: pathlib.Path) -> tuple[str, str]:
    text = decode_text(path.read_bytes())
    head = text[:4000]
    if path.suffix.lower() in SUBTITLE_EXT or TIME_LINE.search(head) or SBV_LINE.search(head):
        # Subtitle cues are often cut mid-sentence (ASR wraps lines), so they are joined back into
        # running text and the aligner splits it by punctuation itself. Scripts that use spaces get one
        # between cues; CJK text is glued directly.
        joined = ""
        for line in subtitle_to_lines(text):
            if joined and not joined[-1].isspace() and not is_wide(joined[-1]) and not is_wide(line[0]):
                joined += " "
            joined += line
        return joined, "subtitle"
    return text, "transcript"


def srt_time(t: float) -> str:
    ms = int(round(max(0.0, t) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio", help="音频文件（mp3 / m4a / wav / opus … ffmpeg 能读的都行）")
    ap.add_argument("text", help="字幕（srt / vtt / lrc）或原稿（txt / md）")
    ap.add_argument("-o", "--out", help="输出文件名前缀，或一个已存在的目录（默认与音频同名，写出 <前缀>.words.srt）")
    ap.add_argument("--model", default="small", choices=MODELS, help="whisper 模型（默认 small）")
    ap.add_argument("--device", default="cpu", choices=["cpu", "cuda", "mps"], help="cpu、cuda 或 mps（默认 cpu；mps 为实验性）")
    ap.add_argument("--language", default="zh", help="文字的语言代码（默认 zh）")
    args = ap.parse_args()

    audio = pathlib.Path(args.audio)
    text_path = pathlib.Path(args.text)
    for p in (audio, text_path):
        if not p.exists():
            print(f"找不到输入文件：{p}", file=sys.stderr)
            return 1
    if shutil.which("ffmpeg") is None:
        print("需要 ffmpeg（用于读取音频）：macOS 可 `brew install ffmpeg`，Windows 可 `winget install ffmpeg`", file=sys.stderr)
        return 1
    text, kind = load_text(text_path)
    if not text.strip():
        print(f"文字来源是空的：{text_path}", file=sys.stderr)
        return 1
    if args.out:
        out_base = pathlib.Path(args.out)
        if out_base.is_dir():
            out_base = out_base / audio.stem
        elif out_base.suffix.lower() == ".srt":
            out_base = out_base.with_suffix("")
        if not out_base.parent.exists():
            print(f"输出目录不存在：{out_base.parent}", file=sys.stderr)
            return 1
    else:
        out_base = audio.with_suffix("")
    out_srt = out_base.with_name(out_base.name + ".words.srt")

    import stable_whisper  # 延迟导入，让 --help 保持快速

    t0 = time.time()
    print(f"文字来源：{text_path.name}（{'字幕' if kind == 'subtitle' else '原稿'}，{len(text)} 字符）")
    print(f"加载模型 {args.model!r}（{args.device}）…", flush=True)
    model = stable_whisper.load_model(args.model, device=args.device)
    print(f"对齐 {audio.name} …", flush=True)
    # A transcript's own lines are good segment boundaries; subtitle text is split by punctuation instead.
    result = model.align(str(audio), text, language=args.language, original_split=(kind == "transcript"), verbose=False)

    words: list[dict] = []
    for seg in result.segments:
        for w in seg.words:
            wt = w.word.strip()
            if not wt:
                continue
            # Whisper splits long Latin words into sub-word tokens without a leading space ("ne" + "uros" +
            # "cience"); glue those back onto the previous word so each cue is a whole word.
            if words and not w.word[:1].isspace() and wt[:1].isalpha() and wt[:1].isascii() and words[-1]["text"][-1:].isascii() and words[-1]["text"][-1:].isalpha():
                words[-1]["text"] += wt
                words[-1]["end"] = round(float(w.end), 3)
                continue
            words.append({"text": wt, "start": round(float(w.start), 3), "end": round(float(w.end), 3)})
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
    zero = sum(1 for w in words if w["end"] <= w["start"])
    print(f"完成，用时 {time.time() - t0:.0f} 秒：{len(words)} 个词，零时长 {zero} 个，最后一个词结束于 {words[-1]['end']:.1f} 秒")
    print(f"已写出 {out_srt}")
    print("把它放进 Audio Reader 的「字幕」槽位，即可获得逐字渐变。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
