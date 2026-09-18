"""Transcribe one Chinese podcast episode and time every character.

    python process_podcast.py episode.mp3 -o episode.timed.json

WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT
-------------------------------------------------
It listens (WhisperX transcription), then pins every character to the moment
it is spoken (WhisperX forced alignment with character alignments on). It
writes text and times and nothing else.

Pinyin and English meanings are NOT added here. Laravel adds them when the
file is imported, through the same DictionaryService (CC-CEDICT + the
overtrue/pinyin package) that Read, Scan, Study and the existing podcast
transcript already use. Doing it here would give podcast words a second,
different dictionary from every other page in the app.

It runs on the admin's own machine, once per episode. The production server
has no GPU and no Python, and the app has no queue worker to run a
minutes-long job in, so the site only ever IMPORTS the result.

OUTPUT (format version 1)
-------------------------
{
  "version": 1,
  "language": "zh",
  "model": "large-v3",
  "duration": 312.4,
  "segments": [
    {
      "start": 0.21, "end": 3.4,
      "text": "你好，今天我们来学习中文。",
      "chars": [
        {"char": "你", "start": 0.21, "end": 0.38, "score": 0.91},
        {"char": "，", "start": null, "end": null, "score": null},
        ...
      ]
    }
  ]
}

`chars` has EXACTLY one entry per character of `text`, in order, including
punctuation and spaces (which simply carry null times). The importer relies on
that one-to-one correspondence to map its own word segmentation back onto the
timings.
"""

import argparse
import gc
import json
import sys
import time
from pathlib import Path

FORMAT_VERSION = 1

# Whisper writes Mandarin in Traditional characters about as often as in
# Simplified, and frequently leaves out punctuation. A Simplified,
# punctuated prompt steers it towards both. The prompt is conditioning, not
# a guarantee, which is why OpenCC runs afterwards anyway.
INITIAL_PROMPT = "以下是普通话的句子，使用简体中文，并带有标点符号。"


def log(message):
    # stderr, so stdout stays clean for anyone piping the JSON.
    print(message, file=sys.stderr, flush=True)


def to_simplified(segments):
    """Traditional -> Simplified, character by character.

    Has to happen BEFORE alignment: the Chinese alignment model's vocabulary
    is Simplified, so a Traditional character it has never seen gets no
    timestamp at all. Converted per character rather than as a phrase so the
    text length can never change - OpenCC's phrase tables occasionally map
    one length to another, and the char list must stay one-to-one.
    """
    from opencc import OpenCC

    cc = OpenCC("t2s")

    def one(ch):
        converted = cc.convert(ch)
        return converted if len(converted) == 1 else ch

    for seg in segments:
        seg["text"] = "".join(one(ch) for ch in seg["text"])
    return segments


def round_time(value):
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    if value != value:  # NaN - alignment emits it for chars it could not place
        return None
    return round(value, 3)


def char_list(segment):
    """One entry per character of the segment text, times or nulls.

    WhisperX already emits chars in text order, but it is rebuilt against the
    text here so a future WhisperX that skipped whitespace (or anything else)
    cannot silently shift every timing after it.
    """
    text = segment.get("text", "")
    aligned = segment.get("chars") or []
    out = []
    j = 0
    for ch in text:
        entry = {"char": ch, "start": None, "end": None, "score": None}
        # Walk forward to the matching aligned char, if any.
        k = j
        while k < len(aligned) and aligned[k].get("char") != ch:
            k += 1
        if k < len(aligned):
            a = aligned[k]
            entry["start"] = round_time(a.get("start"))
            entry["end"] = round_time(a.get("end"))
            entry["score"] = round_time(a.get("score"))
            j = k + 1
        out.append(entry)
    return out


def main():
    parser = argparse.ArgumentParser(description="Time every character of a Chinese podcast.")
    parser.add_argument("audio", help="Path to the episode audio (mp3, m4a, wav...)")
    parser.add_argument("-o", "--output", help="Where to write the JSON (default: <audio>.timed.json)")
    parser.add_argument("--model", default="large-v3", help="Whisper model (default large-v3)")
    parser.add_argument("--device", default=None, help="cuda or cpu (default: cuda when available)")
    parser.add_argument(
        "--compute-type",
        default=None,
        help="int8_float16 on cuda (fits a 4GB card), int8 on cpu by default",
    )
    parser.add_argument("--batch-size", type=int, default=4)
    args = parser.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.is_file():
        log(f"Audio file not found: {audio_path.name}")
        return 2

    output = Path(args.output) if args.output else audio_path.with_suffix(".timed.json")

    import torch
    import whisperx

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    compute_type = args.compute_type or ("int8_float16" if device == "cuda" else "int8")

    started = time.time()
    log(f"Loading audio ({audio_path.name})")
    audio = whisperx.load_audio(str(audio_path))
    duration = round(len(audio) / 16000, 3)  # load_audio resamples to 16kHz

    log(f"Transcribing with {args.model} on {device} ({compute_type})")
    model = whisperx.load_model(
        args.model,
        device,
        compute_type=compute_type,
        language="zh",
        asr_options={"initial_prompt": INITIAL_PROMPT},
    )
    result = model.transcribe(audio, batch_size=args.batch_size, language="zh")

    # Free the ASR model before loading the aligner - a 4GB card cannot hold
    # both, and the aligner is the smaller of the two.
    del model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()

    segments = [s for s in result.get("segments", []) if s.get("text", "").strip()]
    if not segments:
        log("No speech was recognised in this audio.")
        return 3

    for seg in segments:
        seg["text"] = seg["text"].strip()
    segments = to_simplified(segments)

    log("Aligning characters to the audio")
    align_model, metadata = whisperx.load_align_model(language_code="zh", device=device)
    aligned = whisperx.align(
        segments,
        align_model,
        metadata,
        audio,
        device,
        return_char_alignments=True,
    )

    out_segments = []
    for seg in aligned.get("segments", []):
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        seg["text"] = text
        out_segments.append(
            {
                "start": round_time(seg.get("start")),
                "end": round_time(seg.get("end")),
                "text": text,
                "chars": char_list(seg),
            }
        )

    if not out_segments:
        log("Alignment produced no usable segments.")
        return 4

    payload = {
        "version": FORMAT_VERSION,
        "language": "zh",
        "model": args.model,
        "duration": duration,
        "segments": out_segments,
    }

    output.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    timed = sum(1 for s in out_segments for c in s["chars"] if c["start"] is not None)
    total = sum(1 for s in out_segments for c in s["chars"] if not c["char"].isspace())
    log(
        f"Done in {time.time() - started:.0f}s: {len(out_segments)} segments, "
        f"{timed}/{total} characters timed -> {output}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
