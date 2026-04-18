---
title: "How it thinks"
part: 1
---

# How it thinks

Before we talk about codecs, pixels, or anything else technical,
we need to talk about how the encoder thinks.

Because the thinking is the product. The actual ffmpeg process
that does the work at the end is a tool we invoke. The encoder's
value is in the decisions it makes before ffmpeg runs, the safety
it provides during, and the cleanup afterward.

## One job, six stages

An encode is not a single operation. It is a sequence of stages,
each with a specific responsibility, and each handing its results
to the next.

```
 +----------+    +---------+    +------+    +-------+    +---------+    +----------+
 | Validate | -> | Analyze | -> | Plan | -> | Build | -> | Execute | -> | Finalize |
 +----------+    +---------+    +------+    +-------+    +---------+    +----------+
```

Each stage is a separate piece of code. Each one can be tested
in isolation. Each one logs what it decided and why. When
something goes wrong, you do not have to read a thousand-line
ffmpeg command to figure out which part is at fault. You look at
the stage that owned the decision.

The stages are `IValidationStage`, `IAnalysisStage`, `IPlanStage`,
`IBuildStage`, `IExecutionStage`, and `IFinalizeStage` in the
codebase. Every encode passes through this sequence. Specialized
strategies (HLS, DASH, MP4, MKV) can override any stage's
behavior by injecting their own implementation.

## Validate

Validate looks at the profile the user wrote and checks whether
the profile can possibly succeed.

Not whether the encode will look good. Not whether the settings
are ideal. Whether it can succeed at all.

Validate rejects impossible combinations before the rest of the
pipeline runs. A profile that says 4K H.264 at Level 4.1 cannot
succeed, because the level flag caps the declared picture size,
and Apple TV and set-top boxes read it. An AC3 audio profile at
100 kbps cannot produce exactly 100, because AC3 only allows
specific rungs. An encryption config with no key set cannot
actually encrypt anything.

The validator returns a structured response:

```json
{
  "valid": false,
  "errors": [
    {
      "severity": "error",
      "field": "video_profiles[0].level",
      "message": "H.264 Level 4.1 caps at 1080p but the output is 3840×2160.",
      "fix": "Raise the level to 5.1 or drop the resolution to 1920×1080."
    }
  ],
  "warnings": []
}
```

Errors block the save. Warnings are things that will encode but
may not be what you intended.

Validate's full set of rules is covered on the safety net page.
Here the thing to note is that every rule has an id, a field, a
human message, and a fix. The dashboard renders these live as
you type, so you see the problem before you save.

## Analyze

Analyze looks at the actual source file. It does not reject
anything. It just inspects.

The tool doing the inspection is ffprobe:

```
ffprobe -v quiet -print_format json \
        -show_format -show_streams \
        -show_chapters -show_programs \
        "/path/to/source.mkv"
```

The output is parsed into a `SourceAnalysis` record with the
information every downstream stage needs:

```json
{
  "duration_seconds": 7840.256,
  "frame_rate_avg": 23.976,
  "is_variable_frame_rate": false,
  "video_streams": [
    {
      "index": 0,
      "codec": "hevc",
      "width": 3840, "height": 2160,
      "bit_depth": 10,
      "pixel_format": "yuv420p10le",
      "color_transfer": "smpte2084",
      "is_hdr": true,
      "has_dolby_vision": true,
      "dolby_vision_profile": 7
    }
  ],
  "audio_streams": [
    { "index": 1, "codec": "truehd", "channels": 8, "language": "eng" },
    { "index": 2, "codec": "ac3",    "channels": 6, "language": "eng" },
    { "index": 3, "codec": "aac",    "channels": 2, "language": "jpn" }
  ],
  "subtitle_streams": [
    { "index": 4, "codec": "hdmv_pgs_subtitle", "language": "eng", "forced": false },
    { "index": 5, "codec": "ass",               "language": "eng", "forced": false }
  ],
  "chapter_count": 27,
  "attached_fonts": 4
}
```

Whatever ffprobe can parse, the encoder will accept. Even if the
content is unusual, exotic, or technically malformed in small
ways, the encoder will try to work with it. The philosophy is to
be strict about what you produce, and generous about what you
accept.

## Plan

Plan takes two inputs: the analysis from the previous stage, and
the user's profile.

It produces a `PlanResult` — not a command line, but a
structured plan that says, for each output variant, exactly what
will happen:

```json
{
  "strategy": "hls-single-pass",
  "variants": [
    {
      "variant_id": "v0-1080p",
      "video": {
        "codec": "h264",
        "encoder_handle": "h264_nvenc",
        "gpu_index": 0,
        "width": 1920, "height": 1080,
        "rate_control": { "mode": "crf", "crf": 23 },
        "preset": "p4",
        "profile": "high",
        "level": "4.2",
        "pixel_format": "yuv420p",
        "filter_chain": [
          "crop=1920:800:0:140",
          "scale=1920:1080:flags=bicubic"
        ]
      },
      "audio": [
        { "stream_index": 1, "codec": "aac", "channels": 2, "bitrate_kbps": 192 }
      ],
      "segment_duration_seconds": 6,
      "keyframe_interval_seconds": 2
    }
  ],
  "subtitles": [
    { "action": "extract", "source_index": 4, "target": "webvtt", "via_ocr": true }
  ],
  "hardware_bindings": {
    "primary_gpu": { "vendor": "nvidia", "index": 0, "model": "RTX 4080" },
    "decoder_handle": "hevc_cuvid"
  },
  "decisions_log": [
    "source is HEVC 10-bit HDR, profile targets H.264 8-bit → tonemap filter added",
    "crop detected at 1920:800:0:140 (2.40:1 letterbox)",
    "NVENC selected for h264 (speed_index=320 fps for 1080p on RTX 4080)",
    "audio stream 2 (AC3 5.1 eng) skipped — profile requests stereo AAC only"
  ]
}
```

This is the stage where the encoder's opinions show up the most.

If your hardware has a good GPU, the plan chooses the GPU path.
If your source has Dolby Vision and your profile preserves
10-bit, the plan adds the tags that keep Dolby Vision alive. If
your source is letterboxed and you asked for auto-crop, the plan
runs the crop detector and bakes the result into the filter
chain. If your profile has auto-ladder turned on, the plan
generates the variant tiers automatically.

Every decision has a `decisions_log` entry explaining why. So
when you look at an encode afterward and wonder why it chose
HEVC over AV1, the log tells you.

## Build

Build turns the plan into an actual ffmpeg command line.

Building a command line for ffmpeg is not trivial. ffmpeg is not
a Swiss Army knife that you hand a profile and it does the right
thing. It is a giant toolkit of flags and filter chains that all
have to be composed in exactly the right order, with exactly the
right syntax, with encoder-specific flags for whichever encoder
you are actually using.

The output of Build for the plan above would look roughly like
this:

```
ffmpeg -hide_banner -y \
  -init_hw_device cuda=gpu0:0 -filter_hw_device gpu0 \
  -hwaccel cuda -hwaccel_output_format cuda \
  -i "/path/to/source.mkv" \
  -map 0:0 -map 0:1 \
  -vf "hwdownload,format=p010le,crop=1920:800:0:140,\
       zscale=t=linear:npl=100,\
       format=gbrpf32le,\
       zscale=p=bt709,\
       tonemap=tonemap=hable:desat=0,\
       zscale=t=bt709:m=bt709:r=tv,\
       format=yuv420p,\
       scale=1920:1080:flags=bicubic,\
       hwupload_cuda" \
  -c:v h264_nvenc -preset p4 -rc vbr -cq 23 -profile:v high -level 4.2 \
  -pix_fmt yuv420p -g 48 -keyint_min 48 -sc_threshold 0 -bf 3 \
  -c:a aac -b:a 192k -ac 2 -ar 48000 \
  -f hls -hls_time 6 -hls_playlist_type vod \
  -hls_segment_type mpegts \
  -hls_flags independent_segments \
  -hls_segment_filename "/out/v0-1080p/seg_%05d.ts" \
  "/out/v0-1080p/playlist.m3u8"
```

That command was produced from seven lines of profile JSON plus
the source analysis. The translation is what Build does.

If the plan picked the software encoder, the translation is a
different set of flags (`libx264 -preset medium -crf 23 ...`).
If it picked NVENC, it uses `-preset p4 -rc vbr -cq 23` (the
NVENC-specific rate control names). If it picked Apple's
VideoToolbox, it uses a third set. You did not have to know any
of that when you wrote the profile.

Build also writes the master HLS playlist after all variants are
planned, emits the HLS encryption key info file if DRM is
configured, and prepares the subtitle playlist references. These
are covered in later pages.

## Execute

Execute spawns ffmpeg as a child process and watches it run.

ffmpeg emits progress on stderr. The default format is a mix of
human text and `-progress pipe:2` structured output, which is
line-oriented key-value pairs:

```
frame=1742
fps=58.2
bitrate=5232.3kbits/s
total_size=143826944
out_time_us=72094500
out_time_ms=72094
out_time=00:01:12.094500
speed=2.32x
progress=continue
```

The encoder parses this continuously and computes:

- percent complete (out_time divided by total duration)
- current frames per second
- encoding speed multiplier
- estimated time remaining
- current stage name (video, audio, muxer)

All of that flows to the dashboard via SignalR. If you have the
dashboard open you see progress in real time.

If ffmpeg crashes, the encoder captures its stderr, logs the
last known state, and writes a checkpoint file at
`/out/{variant}/.checkpoint.json` that lets a future attempt
resume from where it stopped.

If the user cancels the job, a cancellation token flows down and
the encoder kills the ffmpeg process cleanly, deleting any
partial output.

## Finalize

The encode is done. Now the encoder does the tidying.

Master playlists get written. For HLS, that means a top-level
`master.m3u8` referencing each variant's `playlist.m3u8` with
the right `#EXT-X-STREAM-INF` attributes (bandwidth, resolution,
codec triplet, frame rate, video range). For DASH, it means
writing the `manifest.mpd` with `<Period>`, `<AdaptationSet>`,
and `<Representation>` elements.

Chapter markers get inserted — as `EXT-X-DATERANGE` tags for
HLS, as `<EventStream>` entries for DASH, as chapter atoms for
MP4.

Attached subtitles and fonts get linked from the playlists. The
HLS master's subtitle references become
`#EXT-X-MEDIA:TYPE=SUBTITLES` tags with matching `GROUP-ID`,
`NAME`, `LANGUAGE`, `URI`, and `DEFAULT` attributes.

Checkpoint files get cleaned up. Temp directories get purged.

What the user sees at the end is not a mess of intermediate
files. It is a clean output directory, with everything the
playback side needs, organized the way playback expects.

## The idea of strategies

Every output format is handled by a specialized strategy. A
strategy is a class that implements the six stages for one
container family.

The shipped strategies:

| Strategy                   | Container | Passes | Typical use               |
|----------------------------|-----------|--------|---------------------------|
| `HlsSinglePassStrategy`    | HLS       | 1      | Library encoding          |
| `HlsTwoPassStrategy`       | HLS       | 2      | Space-optimized library   |
| `DashSinglePassStrategy`   | DASH      | 1      | Alternative streaming     |
| `DashTwoPassStrategy`      | DASH      | 2      | Space-optimized DASH      |
| `Mp4SinglePassStrategy`    | MP4       | 1      | Single-file delivery      |
| `Mp4TwoPassStrategy`       | MP4       | 2      | Space-optimized single    |
| `MkvSinglePassStrategy`    | MKV       | 1      | Archival                  |
| `Mp3AudioStrategy`         | MP3       | 1      | Music library             |
| `FlacAudioStrategy`        | FLAC      | 1      | Lossless archive          |
| `OggAudioStrategy`         | OGG       | 1      | Vorbis / Opus archive     |

Each strategy composes the same underlying building blocks. Each
one knows the quirks of its destination container.

Two-pass is a technique where the encoder reads the source
twice. The first pass learns the content. The second encodes
it, using what it learned to allocate bits more efficiently.
Two-pass produces smaller files at the same quality, at the
cost of running twice. It is worth it for library encodes. It
is not worth it for quick re-encodes.

MKV has only a one-pass strategy. MKV is for keeping things.
Two-pass for MKV is rarely useful because you are optimizing
for quality, not file size — and MKV's audio typically stays as
a lossless stream copy anyway.

## Plugins

Everything above — stages, strategies, codec resolvers,
dispatchers, source fetchers, progress sinks — is registered
through dependency injection. Plugins can register their own
implementations alongside the built-ins.

A plugin that wants to add a new output strategy registers an
`IEncodingStrategy`:

```csharp
services.AddTransient<IEncodingStrategy, MyExoticStrategy>();
```

A plugin that wants to override codec resolution — say, to force
a specific hardware encoder for a specific GPU model —
registers an `IEncoderResolver` with a higher priority than the
default.

The encoder's own strategies are built on the same hooks.
Nothing in the built-in set has access to anything a plugin
could not reach. If you want to write a strategy for a
container we did not ship, the API is there.

## Maintenance, honestly

An architecture diagram on a whiteboard looks clean. The reality
of maintaining this is messier.

Every stage has bugs. Some of them are subtle. Analyze might
misread an unusual fourth stream in an obscure container. Plan
might pick the wrong encoder on a GPU we have not tested.
Execute might fail to capture a specific ffmpeg error pattern.
Build might generate a filter chain that works on libx264 but
has a subtle syntax issue on NVENC.

The way we stay honest about this is tests. The encoder has a
large and growing test suite, covering each stage, each codec,
each failure path. When a user reports a bug, the first thing we
do is write a test that reproduces it. If the test passes, the
bug was not where we thought it was. If the test fails, we have
a concrete target. Fix the test, ship the fix, and the next
person who hits the same issue does not.

This does not prevent all bugs. It prevents the same bug from
shipping twice.

## What the next page covers

Now that you know how the encoder thinks, we can talk about what
it actually knows. The codec landscape. Why there are so many,
which ones the encoder supports for output, and how it picks
between them on your behalf.
