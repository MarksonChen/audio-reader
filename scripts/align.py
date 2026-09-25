#!/usr/bin/env python3
"""Forced alignment: give it the audio and the exact transcript, get per-word timestamps.

Uses stable-ts (a Whisper wrapper) in "align" mode: the model does not transcribe, it only
decides *when* each word of the provided text is spoken. Output is a JSON that Audio Reader
accepts in the subtitle slot (逐字 JSON).

Usage:
    scripts/.venv/bin/python scripts/align.py AUDIO TEXT -o OUT.json [--model small] [--device cpu]

Setup (once):
    uv venv --python 3.12 scripts/.venv
    uv pip install --python scripts/.venv/bin/python stable-ts
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio", help="audio file (mp3/m4a/wav …, anything ffmpeg can read)")
    ap.add_argument("text", help="plain-text transcript, one paragraph per line")
    ap.add_argument("-o", "--out", help="output JSON path (default: <audio>.words.json)")
    ap.add_argument("--model", default="small", help="whisper model size: tiny/base/small/medium/large-v3 (default: small)")
    ap.add_argument("--device", default="cpu", help="cpu, cuda or mps (default: cpu)")
    ap.add_argument("--language", default="zh", help="language code of the transcript (default: zh)")
    ap.add_argument("--srt", action="store_true", help="also write a word-level SRT next to the JSON")
    args = ap.parse_args()

    audio = pathlib.Path(args.audio)
    text_path = pathlib.Path(args.text)
    out = pathlib.Path(args.out) if args.out else audio.with_suffix(".words.json")
    text = text_path.read_text(encoding="utf-8-sig")

    import stable_whisper  # imported late so --help stays fast

    t0 = time.time()
    print(f"loading model {args.model!r} on {args.device} …", flush=True)
    model = stable_whisper.load_model(args.model, device=args.device)
    print(f"aligning {audio.name} with {text_path.name} ({len(text)} chars) …", flush=True)
    result = model.align(
        str(audio),
        text,
        language=args.language,
        original_split=True,  # keep one segment per transcript line
        verbose=False,
    )
    elapsed = time.time() - t0

    words = []
    segments = []
    zero = 0
    for seg in result.segments:
        segments.append({"start": round(seg.start, 3), "end": round(seg.end, 3), "text": seg.text.strip()})
        for w in seg.words:
            wt = w.word.strip()
            if not wt:
                continue
            if w.end <= w.start:
                zero += 1
            words.append(
                {
                    "text": wt,
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                    "p": round(float(w.probability), 3),
                }
            )

    payload = {
        "format": "audio-reader-words",
        "version": 1,
        "source": "stable-ts",
        "model": args.model,
        "language": args.language,
        "audio": audio.name,
        "transcript": text_path.name,
        "words": words,
        "segments": segments,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    if args.srt:
        result.to_srt_vtt(str(out.with_suffix(".srt")), word_level=True, segment_level=False)

    durs = [w["end"] - w["start"] for w in words]
    avg = sum(durs) / len(durs) if durs else 0
    print(
        f"done in {elapsed:.0f}s: {len(words)} words, {len(segments)} segments, "
        f"avg word {avg * 1000:.0f} ms, zero-duration {zero}, last word ends at {words[-1]['end'] if words else 0:.1f}s",
        flush=True,
    )
    print(f"saved {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
