---
title: "Describing what you want"
part: 3
---

# Describing what you want

If you have ever read an ffmpeg command line, it looks something
like this:

```
ffmpeg -i input.mkv -map 0:0 -map 0:1 -c:v libx264 -preset medium \
  -crf 23 -profile:v high -level 4.2 -pix_fmt yuv420p \
  -g 48 -keyint_min 48 -sc_threshold 0 -bf 3 \
  -c:a aac -b:a 192k -ac 2 -ar 48000 \
  -f hls -hls_time 6 -hls_playlist_type vod \
  -hls_segment_filename "seg_%05d.ts" playlist.m3u8
```

That is for ONE output. A working multi-variant HLS command can
have dozens of flags. For subtitles and audio track filtering,
more. For hardware acceleration, another pile.

This is not a user interface. It is a ritual.

## Profiles are statements of intent

The encoder asks you to describe intent instead of flags.

You tell it: I want 1080p output. In H.264. At quality
equivalent to CRF 23. Medium preset. Two-second keyframes.
Stereo AAC audio at 192 kbps. In an HLS container. That is the
whole profile.

The encoder reads that intent, looks at your source file, looks
at your hardware, figures out which encoder implementation to
use, translates your quality number to that implementation's
native scale, picks the right filter chain, and runs ffmpeg.

Profiles are stored as JSON in the database. The dashboard
renders a form that maps to the fields. You edit the form, the
form saves the JSON. But nothing stops you from editing the
JSON directly — and the full schema is public.

## The full profile schema

```json
{
  "id": "my-custom-1080p",
  "name": "My Custom 1080p",
  "description": "Personal default for movies",
  "parent_id": null,
  "is_builtin": false,

  "container": "hls",
  "encode_mode": "single_pass",
  "auto_ladder": true,
  "auto_detect_crop": true,
  "hardware_preference": "prefer_hardware",
  "bit_depth_policy": "warn_and_downgrade",
  "hdr_policy": "passthrough_when_possible",
  "tonemap_algorithm": "hable",

  "video_profiles": [
    {
      "codec": "h264",
      "encoder_handle": null,
      "width": 1920,
      "height": 1080,
      "rate_control": {
        "mode": "crf",
        "crf": 23
      },
      "preset": "medium",
      "profile": "high",
      "level": "4.2",
      "bit_depth": 8,
      "pixel_format": "yuv420p",
      "keyframe_interval_seconds": 2,
      "max_bitrate_kbps": null,
      "buffer_size_kbps": null,
      "tune": null,
      "custom_args": ""
    }
  ],

  "audio_profiles": [
    {
      "codec": "aac",
      "channels": 2,
      "sample_rate": 48000,
      "bitrate_kbps": 192,
      "languages": ["en", "ja", "fr"],
      "default_language": "en"
    }
  ],

  "subtitle_profiles": [
    {
      "mode": "extract",
      "codec": "webvtt",
      "languages": ["en"],
      "include_forced": true,
      "ocr_language": "eng"
    }
  ],

  "hls_options": {
    "segment_duration_seconds": 6,
    "playlist_type": "vod",
    "segment_type": "mpegts",
    "independent_segments": true
  },

  "drm": null,

  "custom_arguments": ""
}
```

Four main pieces to focus on.

**Container.** HLS for streaming, MKV for archival, MP4 for
single-file output, and so on. This is the container the
outputs will go into.

**Video profiles.** One or more. Each describes a target
resolution, target codec, quality or bitrate, and encoder
tuning like preset and profile and level.

**Audio profiles.** One or more. Each describes a target codec,
channel count, sample rate, bitrate, and a language filter.

**Subtitle profiles.** If you want the encoder to produce
subtitle tracks, you list them here with the target subtitle
codec and extraction mode.

Plus some optional flags. `auto_ladder` expands a single video
output into a full adaptive-bitrate ladder. `auto_detect_crop`
detects and removes black bars. `encode_mode` picks single-pass
or two-pass. `drm` adds optional AES-128 encryption for HLS
output.

You do not have to use all these fields. Most profiles only use
a few.

## Rate-control modes

The rate-control block is the most asked-about part of a
profile, so let us be precise. Three modes are supported:

```json
// Constant quality (recommended for library encoding)
"rate_control": { "mode": "crf", "crf": 23 }

// Target average bitrate with VBV buffer (recommended for
// streaming and size-constrained delivery)
"rate_control": {
  "mode": "abr",
  "bitrate_kbps": 4500,
  "max_bitrate_kbps": 6000,
  "buffer_size_kbps": 9000
}

// Capped CRF — quality-first, but no spikes above the cap
"rate_control": {
  "mode": "crf_capped",
  "crf": 22,
  "max_bitrate_kbps": 8000,
  "buffer_size_kbps": 16000
}
```

CRF targets a constant visual quality; file size varies with
content. ABR targets a constant bitrate; quality varies with
content. Capped CRF is a hybrid — CRF most of the time, but
cap the bitrate during high-action scenes so your VBV buffer
never overflows on a constrained player.

You cannot set both CRF and ABR. The validator rejects it with:

```json
{
  "severity": "error",
  "field": "video_profiles[0].rate_control",
  "message": "Rate control must specify exactly one of crf or bitrate_kbps.",
  "fix": "Pick one mode: crf, abr, or crf_capped."
}
```

## Ten built-in presets

You do not have to write a profile from scratch. The encoder
ships with ten built-in presets. Each one is tuned for a
specific target. All are cloneable and editable.

| Preset                         | Codec      | Res   | RC        | Audio             | Container |
|--------------------------------|------------|-------|-----------|-------------------|-----------|
| General 1080p Fast             | H.264      | 1080p | CRF 23    | AAC stereo 192k   | HLS       |
| Web 720p                       | H.264      | 720p  | CRF 24    | AAC stereo 128k   | HLS       |
| Archival H.265 1080p           | HEVC       | 1080p | CRF 22 slow | AAC stereo 192k | MKV       |
| Anime 1080p                    | H.264      | 1080p | CRF 21, tune=animation | AAC stereo 192k | MKV |
| Music AAC 192k                 | —          | —     | —         | AAC stereo 192k   | M4A       |
| Chromecast 1080p               | H.264      | 1080p | CRF 23, high@4.1 | AAC stereo 192k | HLS   |
| Apple TV 4K                    | HEVC Main10 | 2160p | CRF 20 @ 5.1 | EAC3 5.1 640k   | HLS (fMP4) |
| Mobile 480p Low Bandwidth      | H.264 Main | 480p  | ABR 1200k @ 3.1 | AAC stereo 96k | HLS    |
| 4K Archival                    | HEVC Main10 | 2160p | CRF 18 slow | FLAC surround   | MKV       |
| Anime HEVC 10-bit 1080p        | HEVC Main10 | 1080p | CRF 20 slow | Opus 5.1 256k   | MKV       |

General 1080p Fast is the default. Most users find something
that fits without writing their own.

## Cloning and tweaking

Built-in presets are marked `"is_builtin": true`. You cannot
edit them directly. If you want to tweak one, you clone it
first:

```
POST /api/v1/encoder/profiles/{id}/clone
```

The clone gets a copy of the profile, a new `id`, and a `name`
with "copy" appended. `parent_id` is set to the original's `id`,
and `is_builtin` is set to false. You edit the copy. The
original built-in stays pristine so the next user who comes
along gets the clean version.

This pattern shows up a lot in the encoder. Built-in things are
read-only. User things are fully editable. The two never mix.

## Inheritance

Presets can have a parent via `parent_id`. If you have a
"Studio Master" preset and you want a variant for a specific
client, you can make a child preset that points at Studio
Master as its parent and override just a few fields.

Example: the client wants the same master, but with burned-in
subtitles instead of sidecar ones.

```json
{
  "id": "client-acme-burnin",
  "name": "ACME Burn-In",
  "parent_id": "studio-master-1080p",
  "subtitle_profiles": [
    { "mode": "burn_in", "codec": "ass", "languages": ["en"] }
  ]
}
```

The child's fields win. The parent's fields fill in anything
the child did not specify. So this child inherits the video and
audio settings from Studio Master, but replaces the subtitle
handling.

This is useful when you maintain a family of related presets.
Update the parent, the children inherit the update.

The encoder walks the parent chain safely. If someone
accidentally creates a cycle, where A points to B and B points
to A, the encoder catches that and raises a clear error
instead of going into an infinite loop:

```json
{
  "severity": "error",
  "field": "parent_id",
  "message": "Parent chain cycles at profile 'acme-variant-b' (acme-variant-a → acme-variant-b → acme-variant-a).",
  "fix": "Remove the parent_id on one of the profiles in the cycle."
}
```

## The auto ladder

Adaptive-bitrate streaming is the thing modern streaming
services do. They do not ship one video file. They ship a
ladder of variants — 360p, 480p, 720p, 1080p, 1440p, maybe 2160p
— and the player picks which one to stream based on the user's
connection.

Writing a profile for five variants means five video-output
sections with slightly different settings. That is tedious. The
encoder has a shortcut.

If you set `"auto_ladder": true`, you only have to write one
video output — the reference. The encoder reads your reference,
looks at the source resolution, and generates the full ladder
automatically.

The default ladder rungs are (width × height, max bitrate in
kbps for H.264):

| Rung | Resolution  | H.264 target kbps | HEVC target kbps |
|------|-------------|-------------------|-------------------|
| 2160 | 3840×2160   | 12000             | 7500              |
| 1440 | 2560×1440   | 8000              | 5000              |
| 1080 | 1920×1080   | 4500              | 3000              |
| 720  | 1280×720    | 2500              | 1700              |
| 480  | 854×480     | 1100              | 750               |
| 360  | 640×360     | 600               | 400               |

Rungs above the source resolution get skipped. A 720p source
will not produce a 1080p variant because upscaling is pointless.
Bitrates per tier are tuned based on source complexity at plan
time — a low-complexity animated source gets thinner tiers, a
film-grain-heavy live-action source gets denser tiers.

You can override the ladder globally in your profile:

```json
{
  "auto_ladder": true,
  "ladder_rungs": [
    { "width": 1920, "height": 1080, "bitrate_kbps": 5000 },
    { "width": 1280, "height": 720,  "bitrate_kbps": 2800 },
    { "width": 854,  "height": 480,  "bitrate_kbps": 1200 }
  ]
}
```

## Import, export, and signing

Presets travel. You can export one as a JSON file and share it:

```
GET /api/v1/encoder/profiles/{id}/export
→ my-custom-1080p.preset.json
```

Two paths for import. Paste the JSON into the dashboard. Or
point at an HTTPS URL and let the encoder fetch it:

```
POST /api/v1/encoder/profiles/import
Content-Type: application/json

{ "url": "https://community.example/presets/anime-10bit.preset.json" }
```

Plain HTTP is rejected. Preset contents influence the filter
chain and flag set the encoder runs, so a man-in-the-middle
could inject hostile flags. HTTPS is non-negotiable for remote
import.

Optionally, presets can be signed. A community publisher can
sign their presets with their own key, and users can trust
specific publishers:

```json
{
  "id": "anime-10bit-community",
  "name": "Anime 10-bit Community Build",
  "publisher_key_fingerprint": "sha256:3f:ad:21:...",
  "signature": "..."
}
```

The encoder verifies the signature on import. Unsigned presets
still work — they just require the user to acknowledge the
source.

This is how a community preset library eventually works.
Someone figures out a great preset for their weird specific
projector. They publish the JSON, sign it. Others import it,
try it, tweak it, share their own variants. The plumbing is in
place; the library is not published yet.

## What the next page covers

You can now describe what you want. But what if what you want
is broken in a way you do not know about?

The next page covers the safety net. The list of user mistakes
the encoder catches before you waste encode time.
