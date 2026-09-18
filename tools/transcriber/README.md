# Podcast transcriber (WhisperX)

Makes the **synced transcript** for a podcast episode: every word lights up as
it is spoken, and clicking a word plays from it.

It runs **on your own computer, once per episode**. The production server has
no GPU and no Python, and the app has no background worker for a job that
takes minutes, so the website only ever *imports* the finished file.

```
episode audio
  -> WhisperX transcribes the Chinese speech        (this folder)
  -> WhisperX times every character
  -> JSON file
  -> uploaded to Laravel (or imported by artisan)
  -> CC-CEDICT splits it into words, adds pinyin + meaning   (backend)
  -> saved on the podcast row
  -> the episode page highlights along with the audio        (frontend)
```

Pinyin and meanings are added by Laravel, not here, so podcast words use the
same dictionary as Read, Scan and Study.

## Install (once)

Needs Python **3.11**, ffmpeg on PATH, and ideally an NVIDIA GPU.

```bash
cd tools/transcriber
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install --upgrade pip
.venv/Scripts/python -m pip install -r requirements.txt
# Swap the CPU torch whisperx pulled in for the CUDA build:
.venv/Scripts/python -m pip install --force-reinstall --no-deps torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128
# Check the GPU is seen (should print True):
.venv/Scripts/python -c "import torch; print(torch.cuda.is_available())"
```

On macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python`.
No Hugging Face token is needed: speaker diarization is not used.

The first run downloads the Whisper `large-v3` model (~3 GB) and the Chinese
alignment model (~1.2 GB) into `~/.cache/huggingface`. Later runs reuse them.

## Process an episode

### Local database (audio on this machine)

```bash
cd backend
php artisan podcast:transcribe 3        # one episode
php artisan podcast:transcribe --all    # every episode with audio and no transcript yet
```

This runs WhisperX, imports the result, and leaves the JSON at
`backend/storage/app/transcripts/podcast-3.json`.

### Production (or any other site)

1. Get the episode's audio file (the original upload, or download it from the
   episode page's audio URL).
2. Run the script directly:

   ```bash
   cd tools/transcriber
   .venv/Scripts/python process_podcast.py episode.mp3 -o episode.timed.json
   ```

3. On the site, open the episode, **Edit -> Sync**, and upload
   `episode.timed.json`.

To re-import an existing file into the local database without re-running
WhisperX: `php artisan podcast:transcribe 3 --file=path/to/file.json`.

### Options

| Flag | Default | |
|---|---|---|
| `--model` | `large-v3` | `medium` is faster and less accurate |
| `--device` | `cuda` if available | `cpu` works, much slower |
| `--compute-type` | `int8_float16` (cuda), `int8` (cpu) | fits a 4 GB card |
| `--batch-size` | `4` | raise it on a bigger GPU |

## Speed

Measured on an RTX 3050 Ti (4 GB): a 5.5 minute episode took 60 seconds once
the models were downloaded, and about 10 minutes on the very first run, almost
all of it downloading. A "fix torchcodec installation" warning is printed and
is harmless: audio is decoded through ffmpeg, not torchcodec.

## Output format

```json
{
  "version": 1,
  "language": "zh",
  "model": "large-v3",
  "duration": 331.3,
  "segments": [
    {
      "start": 13.335, "end": 37.735,
      "text": "大家好,欢迎回来……",
      "chars": [
        {"char": "大", "start": 13.335, "end": 13.475, "score": 0.93},
        {"char": ",", "start": 13.775, "end": 13.936, "score": 0.51}
      ]
    }
  ]
}
```

`chars` has exactly one entry per character of `text`, in order. A character
the aligner could not place has `null` times.

## Known limits

- It transcribes what it **hears**. The episode's own written transcript is
  left untouched and still shown when the synced view is switched off; the two
  may differ where WhisperX misheard.
- Latin words inside Chinese ("AI", names) are shown but are not dictionary
  words, so they have no pinyin card and cannot be clicked to seek.
- Chinese alignment has only been spot-checked on one episode so far. Expect
  some words to light up slightly early or late; listen through an episode
  once after importing it.
