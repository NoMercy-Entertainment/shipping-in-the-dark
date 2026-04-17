---
title: "The safety net"
part: 4
---

# The safety net

Here are the three ways a misconfigured encode actually goes
wrong. None of them are "ffmpeg crashes forty minutes in."
ffmpeg is faster than that, and its misbehavior is more subtle.

**Way one.** The profile is bad enough that ffmpeg refuses to
start. You get a cryptic error on the first second. Usually a
format flag that does not exist on this encoder, or a codec the
container cannot hold. The user is not a video engineer. They
read the error, do not understand it, and come away thinking
the encoder is broken.

**Way two.** ffmpeg runs to completion. The file gets written.
It even plays on the machine the user tested on. Then they try
to watch it on their Apple TV and it refuses. The file declares
H.264 Level 4.1 in its header, but the actual picture is 4K.
Level 4.1 caps at 1080p. Apple TV reads the level flag, refuses
to decode. The user's PC ignored the mismatch because software
decoders are lenient. The Apple TV was not.

**Way three.** ffmpeg runs, the file plays everywhere, but it
looks terrible. The user set CRF 40 because they saw a forum
post recommending it for something unrelated. CRF 40 on H.264
is far past the usable range. The picture is blocky and
smeared. Their friend, watching on a nice screen, asks why this
movie looks like a potato.

All three of these can be caught before ffmpeg runs. That is
the safety net.

## The validator API

Every profile goes through the validator at save time and every
time a field changes. The endpoint:

```
POST /api/v1/encoder/profiles/validate
Content-Type: application/json

{ ...profile JSON... }
```

Response shape:

```json
{
  "valid": false,
  "errors": [
    {
      "id": "level.resolution_mismatch",
      "severity": "error",
      "field": "video_profiles[0].level",
      "message": "H.264 Level 4.1 caps at 1080p but the output is 3840×2160.",
      "fix": "Raise the level to 5.1 or drop the resolution to 1920×1080."
    }
  ],
  "warnings": [
    {
      "id": "crf.out_of_typical_range",
      "severity": "warning",
      "field": "video_profiles[0].rate_control.crf",
      "message": "CRF 40 on H.264 produces noticeably blocky output.",
      "fix": "Typical quality range is 18 to 28. Consider CRF 22 as a starting point."
    }
  ]
}
```

Errors block the save. Warnings do not. Every rule has a stable
`id` so dashboards and documentation can link to specific
explanations.

The dashboard calls this endpoint on every keystroke in the
profile form. Errors render red on the relevant field.
Warnings render yellow. You see the state of your profile
before you click save.

## The categories of rule

The validator catches many categories of mistake. Not from a
fixed list — new rules get added as real users hit real
problems. Each bug becomes a rule, and the rule protects
everyone going forward. Here are the categories, ordered from
basic to subtle.

### Structural problems

The basics. A profile with no name. A profile with no video or
audio outputs. A video output with zero width. A video output
that specifies neither a bitrate nor a CRF, leaving the
encoder to guess.

```json
{
  "id": "video.rate_control_missing",
  "field": "video_profiles[0].rate_control",
  "message": "Rate control must specify exactly one of crf or bitrate_kbps.",
  "fix": "Pick one mode: crf, abr, or crf_capped."
}
```

These are caught trivially. The validator looks at the profile
as data, checks that required fields are present, rejects if
they are not.

### Codec and container compatibility

HLS cannot hold VP9. DASH can. MP4 technically can hold VP9 but
most players will not play it. MKV can hold anything. Each
container has its own codec allowlist. The validator enforces:

```json
{
  "id": "codec.container_mismatch",
  "field": "video_profiles[0].codec",
  "message": "VP9 is not supported in HLS.",
  "fix": "Allowed codecs for HLS are H.264, HEVC, and AV1."
}
```

Similar rules for audio. HLS wants AAC, AC-3, E-AC-3, or Opus.
MP3 in HLS is technically possible but not widely supported, so
the validator warns rather than blocks.

### Level and dimensions

Way two above. H.264 Level 4.1 is a popular default. It caps at
1080p. If your profile has Level 4.1 and a 4K resolution, the
validator rejects:

```json
{
  "id": "level.resolution_mismatch",
  "message": "H.264 Level 4.1 caps at 1920×1088 but the output is 3840×2160.",
  "fix": "Raise the level to 5.1 or drop the resolution to 1920×1080."
}
```

The same check runs for HEVC and VP9. Each codec has its own
level table. Abbreviated:

| Codec | Level | Max res    | Max bitrate (High profile) |
|-------|-------|------------|-----------------------------|
| H.264 | 4.0   | 1920×1088  | 25 Mbps                     |
| H.264 | 4.1   | 1920×1088  | 50 Mbps                     |
| H.264 | 5.0   | 3840×2160  | 135 Mbps                    |
| H.264 | 5.1   | 3840×2160  | 240 Mbps                    |
| HEVC  | 5.0   | 3840×2160  | 40 Mbps (Main 10)           |
| HEVC  | 5.1   | 3840×2160  | 100 Mbps (Main 10)          |
| HEVC  | 6.0   | 7680×4320  | 240 Mbps                    |

### Quality and bitrate

Way three above. CRF 40 on H.264 produces visibly blocky
output. The validator warns. Not blocks, because maybe that is
what you want for a tiny preview encode. But it tells you.

Same for bitrate. 4K H.264 at 2 Mbps is unwatchable regardless
of preset. The validator warns with a codec-aware floor:

```json
{
  "id": "bitrate.too_low_for_resolution",
  "message": "4K H.264 at 2000 kbps produces severe compression artifacts.",
  "fix": "Typical 4K H.264 bitrate is 15000-25000 kbps. For better efficiency, consider HEVC (8000-15000 kbps)."
}
```

HEVC, AV1, and VP9 get lower floors because they are more
efficient.

AC-3 has a specific bitrate ladder. If you pick a value between
rungs, ffmpeg silently rounds down. 100 becomes 96 and you
never know. The validator catches off-ladder values:

```json
{
  "id": "audio.ac3_off_ladder_bitrate",
  "message": "AC-3 at 100 kbps is not a valid rung.",
  "fix": "Nearest valid rungs are 96 kbps or 112 kbps. AC-3 accepts: 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 448, 512, 576, 640."
}
```

### Bit depth and codec compatibility

Every H.264 hardware encoder is 8-bit only. If your profile
specifies 10-bit H.264, the resolved output will be 8-bit with
a silent downgrade — unless your `bit_depth_policy` says
otherwise.

```json
{
  "id": "bit_depth.no_hardware_support",
  "severity": "warning",
  "message": "10-bit H.264 has no hardware encoder support. Output will be software encoded or silently downgraded to 8-bit.",
  "fix": "Set bit_depth_policy to 'prefer_software' to force libx264, or change codec to HEVC/AV1 which have 10-bit hardware support."
}
```

VP9 has the opposite issue. Its profile numbers encode the bit
depth. Profile 0 and 1 are 8-bit only. Profile 2 and 3 are 10
or 12-bit. If your profile says "10-bit, profile 0", the
validator rejects with instructions to use profile 2 or 3.

### Adaptive-bitrate ladder sanity

If you manually write a multi-variant profile and accidentally
make the 1080p variant lower bitrate than the 720p variant,
your ladder is broken. The player sees no reason to switch up
to 1080p. You wasted encode time on the 1080p variant.

```json
{
  "id": "ladder.inverted",
  "field": "video_profiles",
  "message": "Ladder is inverted. video_profiles[1] (720p) at 3000 kbps exceeds video_profiles[0] (1080p) at 2500 kbps.",
  "fix": "Ensure bitrate increases with resolution. Players will not switch up to a higher-res variant that has a lower bitrate."
}
```

### Duplicate variants

Two video outputs with exactly the same settings. The encoder
would run the same encode twice and produce two copies of the
same file.

```json
{
  "id": "ladder.duplicate_variant",
  "severity": "warning",
  "message": "Duplicate variant at video_profiles[2]. Same codec, resolution, bitrate, CRF, and bit depth as video_profiles[1]."
}
```

### Segment and keyframe alignment

HLS and DASH chop your video into segments. Each segment should
start on a keyframe. If your segment duration is not an integer
multiple of your keyframe interval, the encoder has to either
insert extra keyframes to land on boundaries (raising your
bitrate) or let segments drift in length (making players
rebuffer).

```json
{
  "id": "hls.keyframe_segment_misalignment",
  "severity": "warning",
  "message": "Keyframe interval 2s does not evenly divide segment duration 5s.",
  "fix": "Use a keyframe interval that divides the segment duration. Examples: 2s keys with 6s segments; 3s keys with 6s segments."
}
```

### Reserved flag guards

The profile has a `custom_arguments` field where you can pass
raw ffmpeg flags we do not cover in the schema. It is an
escape hatch for power users.

But certain flags are managed by the encoder. If you pass them
via custom_arguments, you override the encoder's decisions in
ways that break things subtly:

```json
{
  "id": "custom_args.reserved_flag",
  "field": "custom_arguments",
  "message": "The flag -c:v is reserved. The encoder pipeline manages codec selection.",
  "fix": "Remove the override and use the codec field on the video profile instead."
}
```

The reserved flag list includes `-c:v`, `-c:a`, `-preset`,
`-init_hw_device`, `-hwaccel`, `-f`, `-map`, `-vf`, `-af`,
`-hls_time`, `-hls_segment_filename`. Safe flags like `-metadata`
pass through.

## The preview endpoint

The validator checks the profile in isolation. The preview
endpoint adds the source file to the picture.

```
POST /api/v1/encoder/profiles/{id}/preview
Content-Type: application/json

{ "source_video_file_id": "vf-abc123" }
```

Response:

```json
{
  "profile_id": "general-1080p-fast",
  "source_video_file_id": "vf-abc123",
  "source_analysis": { /* ...see architecture page... */ },
  "per_stream_plan": {
    "video_streams": [
      {
        "source_index": 0,
        "action": "transcode",
        "reason": "source is HEVC 10-bit HDR, profile wants H.264 8-bit",
        "target": { "codec": "h264", "width": 1920, "height": 1080, "crf": 23 },
        "filter_chain_summary": "crop → tonemap (HDR→SDR) → scale",
        "bit_depth_downgrade": true
      }
    ],
    "audio_streams": [
      { "source_index": 1, "action": "transcode", "from": "truehd 8ch", "to": "aac 2ch 192k" },
      { "source_index": 2, "action": "skip",      "reason": "language 'jpn' not in profile language filter" }
    ],
    "subtitle_streams": [
      { "source_index": 4, "action": "extract_ocr", "from": "pgs eng", "to": "webvtt eng" }
    ]
  },
  "source_warnings": [
    {
      "id": "source.variable_frame_rate",
      "severity": "warning",
      "message": "Source is variable frame rate (24.00-29.97 fps range detected). VFR encodes can drift audio sync on long files.",
      "fix": "Consider forcing a constant frame rate with the force_cfr profile flag."
    },
    {
      "id": "source.dolby_vision_will_be_stripped",
      "severity": "warning",
      "message": "Source has Dolby Vision (profile 7), but the target profile produces H.264 8-bit, which cannot carry DV metadata.",
      "fix": "To preserve Dolby Vision, switch to an HEVC 10-bit output profile like 'Apple TV 4K'."
    }
  ]
}
```

For each stream, you see exactly what will happen. Copy?
Transcode? Skip? With what target parameters. Plus source-level
warnings for things the plain validator could not know (variable
frame rate, Dolby Vision stripping, upscaling, etc.).

The result is that before you click encode, you know exactly
what will happen to your source. You get to decide whether the
plan matches what you want. And you never get the "works on my
PC, refuses on my Apple TV" surprise, because the validator
would have caught the level mismatch at save time.

## What the next page covers

You have a validated profile and a previewed action plan. Now
the encoder has to actually do the work. That means
understanding what your hardware can do.

The next page covers hardware measurement and HDR handling.
