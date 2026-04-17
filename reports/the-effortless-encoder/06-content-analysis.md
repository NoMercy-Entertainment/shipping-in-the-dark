---
title: "Watching the content"
part: 6
---

# Watching the content

Most encoders treat your video as an opaque blob of pixels. They
encode the pixels. They are done.

This one can watch the content. It can detect what the video
actually contains, and use what it finds to make better
decisions — smaller files, cleaner crops, skip-intro buttons,
text subtitles from bitmap sources, captions for a silent
source.

Four analysis tools ship: crop detection, intro and outro
fingerprinting, subtitle optical character recognition, and
speech transcription via Whisper.

Each one runs as a standalone building block. You can invoke
them from the dashboard for spot-checking. You can let
subscribers run them automatically when a file lands in a
library folder.

Let us walk through each.

## Crop detection

**Problem.** Many sources have black bars. A 2.40:1 movie in a
16:9 frame has thick black bars on top and bottom. A 4:3
archive in a 16:9 frame has black bars on the sides.

ffmpeg does not know the black bars are not part of the
picture. It encodes them like any other pixels. The black bars
waste encoding budget. The output looks awkward on non-standard
displays because the aspect ratio is wrong.

**Solution.** Run ffmpeg's `cropdetect` filter against a sample
of frames. It returns a rectangle describing the real picture
area. The encoder uses the rectangle to crop the video before
encoding.

The detection command:

```
ffmpeg -ss 60 -t 180 -i "/path/to/source.mkv" \
  -vf "cropdetect=limit=24:round=4:reset=0" \
  -f null - 2>&1 | grep -oE "crop=[0-9:]+" | sort | uniq -c | sort -rn | head -5
```

`cropdetect` outputs a per-frame `crop=W:H:X:Y` suggestion. The
analysis takes the most frequent value across a sample window
(three minutes starting one minute in, by default). That
sample is typically enough to get a stable answer while
skipping opening logos.

The result record:

```json
{
  "source_video_file_id": "vf-abc123",
  "should_crop": true,
  "width": 1920,
  "height": 800,
  "x": 0,
  "y": 140,
  "sample_frames_analyzed": 4320,
  "confidence": 0.98
}
```

You see this in the dashboard. If the detected rectangle
matches the full frame, `should_crop` is false.

You can run crop detection manually:

```
POST /api/v1/encoder/content-analysis/crop/{video_file_id}
```

No encode runs, just the detection. Crop detection is
ffmpeg-bound, so it takes time proportional to the source — a
90-minute film takes roughly 30 to 60 seconds to crop-detect on
a decent box. The manual endpoint is gated to the server owner
to prevent denial of service.

If you want crop detection to run automatically for every
encode in a given profile, set `"auto_detect_crop": true` in
the profile. When the plan stage runs for that profile, it runs
crop detection before building the filter chain, and the
resulting crop rectangle becomes the first filter in the chain:

```
-vf "crop=1920:800:0:140,scale=1920:1080:flags=bicubic"
```

## Intro and outro fingerprinting

**Problem.** TV shows have recurring intros. The first minute
of every episode is the same opening theme, the same title card
sequence. Viewers who binge a show end up skipping through the
intro every episode. Or they watch it every time, which wastes
their time.

Modern players can offer a "skip intro" button, but only if
they know where the intro starts and ends. Usually that data is
hand-curated by a service like Netflix. A self-hosted server
needs to derive it automatically.

**Solution.** Audio fingerprinting with chromaprint, combined
with shared-prefix detection across episodes.

Chromaprint is the fingerprint format used by AcoustID for
music identification. It generates a compact hash of the
perceptual audio features, stable under re-encoding, minor
volume shifts, and other common distortions. A fingerprint is
an array of 32-bit integers, roughly one per 0.124 seconds of
audio.

The pipeline, per show:

1. For each episode, extract the first three minutes of audio
   at 16 kHz mono:

   ```
   ffmpeg -i ep01.mkv -t 180 -ar 16000 -ac 1 -c:a pcm_s16le ep01.intro.wav
   ```

2. Fingerprint that audio with `fpcalc`:

   ```
   fpcalc -raw -length 180 ep01.intro.wav
   ```

   Output:
   ```
   DURATION=180
   FINGERPRINT=1251987342,1251987270,1251987268,1251987269,...
   ```

3. For each pair of episodes, slide one fingerprint against the
   other and compute a Hamming-distance similarity score at
   each offset.

4. Cluster the pairs. The cluster with the most-matching
   members is the intro. The start and end offsets within each
   episode come from the slide position of its best match.

The detector uses a sliding-window Hamming distance match with
a small tolerance window (about 10 seconds on either side) to
handle cases where intros start at slightly different times.
Episode A starts its intro at 15 seconds, episode B at 22
seconds — same audio, different offsets. The detector clusters
them together.

The output is an intro marker per episode. Start timestamp, end
timestamp, confidence score 0 to 1, and a `source` flag so
manual overrides are protected:

```json
{
  "show_id": "show-123",
  "episode_id": "ep-s01e01",
  "type": "intro",
  "start_seconds": 15.2,
  "end_seconds": 105.7,
  "confidence": 0.91,
  "source": "auto",
  "fingerprint_hash": "sha256:..."
}
```

The marker goes into the `content_segments` table in the
database. The player reads it and shows a skip-intro button.

**Outro detection** is the mirror. Fingerprint the last three
minutes of each episode. Look for the shared tail.

You can edit detected segments through the dashboard. If
auto-detection got the end of the intro slightly wrong, you
nudge it. When you manually edit a segment, the `source` flips
to `"manual"`, which tells the auto-detector to leave it alone
on the next run.

Like crop detection, fingerprinting is minutes of ffmpeg work
per episode. Running it automatically on every episode in a
large library takes hours. The intro-detection subscriber runs
it in the background, triggered by encoded episodes landing in
a library folder. You do not wait for it.

## Subtitle optical character recognition

**Problem.** Blu Ray sources ship with PGS subtitles, which are
bitmap subtitles. Each subtitle cue is a tiny image. Apple TV
can render them. Most smart TVs can render them. Web players
cannot. DASH and HLS playlists cannot carry bitmap subs.

To put PGS subtitles in an HLS playlist, you need to convert
them to text. That means optical character recognition. Run an
OCR engine against each subtitle frame and extract the text.

**Solution.** Tesseract, via a custom OCR subtitle encoder that
ships as part of NoMercy's ffmpeg build. The journal entry "The
Wrong Filename" (entry 008) covers how this encoder was built.

The spot-check endpoint:

```
POST /api/v1/encoder/content-analysis/ocr/{video_file_id}
Content-Type: application/json

{
  "stream_index": 4,
  "language": "eng",
  "target_format": "webvtt"
}
```

Internally, this runs ffmpeg with the OCR subtitle encoder:

```
ffmpeg -i source.mkv -map 0:4 \
  -c:s ocr_subtitle -ocr_lang eng -ocr_upscale 3 \
  -f webvtt output.en.vtt
```

Tesseract needs trained data per language. English works out of
the box. Adding a new language means downloading its trained
data file. Managed through the dashboard:

```
GET  /api/v1/encoder/ocr/languages
POST /api/v1/encoder/ocr/languages/{code}/download
```

Available language codes include `eng`, `jpn`, `chi_sim`,
`chi_tra`, `kor`, `fra`, `ger`, `spa`, `ita`, `por`, `rus`,
`dut`, `ara`, `hin`. The trained data ends up under the
configured Tesseract models directory (default
`<encoder_data>/tesseract/`).

One interesting implementation detail covered in entry 008:
the OCR encoder uses a luminance-weighted alpha composite
before OCR instead of a naive grayscale. Subtitles are bright
text on a transparent background. Naive grayscale produces
low-contrast images. Luminance-weighted alpha composite
produces high-contrast black-on-white that Tesseract reads
accurately. That single change took the OCR from "barely
usable" to "production-quality."

## Speech transcription with Whisper

**Problem.** Some sources ship without subtitles at all. A
foreign-language documentary with no English subs. A home
video you filmed on a phone. Manual transcription is hours of
work per hour of content. Cloud transcription APIs require
uploading your library to someone else, which defeats the
point of self-hosting.

**Solution.** Run Whisper locally. Whisper is OpenAI's speech
recognition model, released as open weights. A C++ port called
`whisper.cpp` runs on consumer hardware without requiring a
cloud service.

The endpoint:

```
POST /api/v1/encoder/content-analysis/whisper/{video_file_id}
Content-Type: application/json

{
  "audio_stream_index": 1,
  "language": "ja",
  "translate_to_english": true,
  "model": "large-v3"
}
```

Internally, whisper is invoked against the first audio stream:

```
ffmpeg -i source.mkv -map 0:1 -ar 16000 -ac 1 -c:a pcm_s16le tmp.wav
whisper-cli -m models/ggml-large-v3.bin -l ja -tr --output-vtt tmp.wav
```

Whisper has five model sizes. Pick by the speed/accuracy
trade-off:

| Model     | Size   | Quality                                             |
|-----------|--------|------------------------------------------------------|
| Tiny      | 75 MB  | Fast, but only recognizes words in rough shape       |
| Base      | 150 MB | OK for clear speech                                  |
| Small     | 500 MB | Good for most content                                |
| Medium    | 1.5 GB | Near-human on clean audio                            |
| Large V3  | 3 GB   | Best available; handles accents and technical terms |

Large V3 is the recommended default. The smaller models miss
specialized vocabulary. Show-specific names, technical terms,
proper nouns — all of that gets muddled. Only Large V3 gets
them reliably.

Whisper has an interesting bonus feature. Translate-to-English
mode. You give it a Japanese audio track, ask for English
subtitles with `translate_to_english: true`, and it transcribes
the Japanese and translates to English in one pass. Useful for
anime and foreign content.

Whisper is slow. A 90-minute movie takes roughly 15 to 30
minutes to transcribe on a decent GPU; longer on CPU. The
encoder reports progress as a percentage so the dashboard can
show it. The output WebVTT lands next to the source file.

## How analysis feeds the pipeline

These tools are standalone, but they really shine when combined
with the rest of the pipeline.

- Crop detection feeds the profile's filter chain.
- Intro and outro markers flow to players via the
  `content_segments` table.
- OCR subtitles become sidecars in HLS and DASH outputs.
- Whisper transcriptions become sidecars too, for sources that
  had no subtitles.

Subscribers watch for events on the server's event bus. When an
episode is scanned, the intro subscriber fires and runs
fingerprinting. When a new file lands in a watched folder, the
auto-encode subscriber fires and starts an encode. When an
encode completes, the OCR subscriber inspects the output's
subtitle streams and runs OCR if needed.

The subscribers run in the background. They do not block
anything. They just quietly improve the library over time.

## What the next page covers

You have a well-analyzed source and a validated profile. The
encoder is ready to produce output.

The next page covers two topics that go together. Subtitles,
and the optional encryption layer for paid streaming.
