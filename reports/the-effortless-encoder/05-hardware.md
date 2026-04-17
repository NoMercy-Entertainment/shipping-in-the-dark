---
title: "Measuring the machine"
part: 5
---

# Measuring the machine

Video encoding is one of those tasks where "how fast is your
computer" has a wide range of answers, depending on what you
are asking about.

A workstation with a recent NVIDIA card can encode H.264 at
hundreds of frames per second. That is several times faster
than real-time for typical 24-30 fps content.

The same workstation running the software encoder `libx264` on
the same content might do something like 60-100 fps on the
`medium` preset. Still faster than real-time, but not by much.

And the same workstation running AV1 on the SVT-AV1 software
encoder at a quality-oriented preset might do single digits of
frames per second. At that rate, a 90-minute movie is an
overnight job.

Same machine. Same content. Large differences in speed, driven
entirely by which encoder you picked.

The encoder has to pick the fastest one that can deliver the
quality you asked for. And to do that, it has to actually
measure your machine. It cannot guess.

## The first-boot benchmark

When the server starts for the first time — or when the encoder
detects that you upgraded your graphics drivers, or that the
hardware table has a new entry — it runs a benchmark.

The benchmark is not subtle. It spawns ffmpeg with a synthetic
test pattern source, runs it through each available encoder,
and measures frames per second. A representative run looks like
this:

```
[benchmark] GPU 0: NVIDIA GeForce RTX 4080 (driver 551.23)
[benchmark]   h264_nvenc  @ 480p:  820 fps
[benchmark]   h264_nvenc  @ 720p:  520 fps
[benchmark]   h264_nvenc  @ 1080p: 320 fps
[benchmark]   h264_nvenc  @ 2160p:  92 fps
[benchmark]   hevc_nvenc  @ 1080p: 290 fps
[benchmark]   hevc_nvenc  @ 2160p:  74 fps
[benchmark]   av1_nvenc   @ 1080p: 180 fps
[benchmark]   av1_nvenc   @ 2160p:  48 fps
[benchmark] CPU: AMD Ryzen 9 7950X (16C/32T)
[benchmark]   libx264    @ 1080p medium: 96 fps
[benchmark]   libx265    @ 1080p medium: 38 fps
[benchmark]   libsvtav1  @ 1080p preset=6: 62 fps
[benchmark] measurement complete, speed_index refreshed
```

The result lands in a speed index table keyed by `(codec,
encoder_handle, resolution, gpu_index)`:

```json
{
  "machine_id": "nomercy-host-01",
  "measured_at": "2026-04-17T03:12:04Z",
  "gpus": [
    { "index": 0, "vendor": "nvidia", "model": "RTX 4080", "driver": "551.23" }
  ],
  "cpu": { "model": "AMD Ryzen 9 7950X", "cores": 16, "threads": 32 },
  "speed_index": [
    { "codec": "h264", "handle": "h264_nvenc", "resolution": "1080p", "gpu_index": 0, "fps": 320 },
    { "codec": "h264", "handle": "libx264",    "resolution": "1080p", "preset": "medium", "fps": 96 },
    { "codec": "av1",  "handle": "libsvtav1",  "resolution": "1080p", "preset": "6", "fps": 62 }
  ]
}
```

On a multi-GPU machine, each GPU gets its own measurements. If
you have one fast card and one slow card, the benchmark
distinguishes between them. An RTX 4080 encodes differently
from an RTX 3060 even though both run NVENC.

The benchmark endpoint can also be triggered manually:

```
POST /api/v1/encoder/hardware/benchmark
{ "codecs": ["h264","hevc","av1"], "resolutions": ["480p","1080p","2160p"] }
```

## Why measure instead of guess

Guessing is what many encoders do. They assume that if you have
NVENC, it must be fast. Must be faster than software. Use it.

Reality is messier.

- A first-generation NVENC card is slower than `libx264` at the
  `slow` preset, while being worse quality.
- A Jellyfin-style integrated GPU using shared system memory
  can be slower than the CPU for 4K encodes.
- An NVENC card under heavy thermal throttling, in a sauna of a
  case, can underperform its spec.
- A hardware encoder that technically exists but fails to
  initialize (driver issue, insufficient VRAM for the
  resolution, wrong session cap) is worse than useless — it
  will take the slot and then crash.

The only way to know is to measure. Measurement also catches
cases where the hardware is broken. A card with a driver issue
might fail to initialize. A card with insufficient memory for
4K encoding might fall back to a tiled mode that is both slower
and lower quality. The benchmark catches these failures, logs
them, and marks that combination unavailable.

Recalibration runs automatically on a rolling schedule (monthly
by default). Drivers change, thermals change, and stale data
can mislead the scheduler. Fresh measurements keep the picture
accurate.

## How the encoder uses the measurements

Every time you save a profile and the encoder resolves which
encoder to actually use, it consults the speed index.

If you have a profile that says H.264 and you have both NVENC
and `libx264` available, the encoder asks the speed index.
Which one is faster at the target resolution on this specific
GPU? Pick that one.

If you set `hardware_preference: "prefer_quality"`, the encoder
overrides to software regardless of speed. Software encoders
are still better quality at matched bitrate for most content.

If you set `hardware_preference: "force_hardware"` and no
hardware encoder is available, the encoder refuses to run. That
is deliberate. You said "force", so running on software would
violate your stated intent.

The preview endpoint (see the safety-net page) uses the speed
index too. When it builds the action plan for your source, it
tells you which specific encoder will run and roughly how long
the encode will take:

```json
{
  "estimated_fps": 320,
  "estimated_duration_seconds": 24,
  "encoder_handle": "h264_nvenc"
}
```

## HDR, the other hardware concern

Modern content, especially movies from the last several years,
is often mastered in HDR. High dynamic range, which means the
brightness information per pixel has more bits, and the color
space is wider.

HDR content is great on an HDR-capable display. It is
disappointing on a non-HDR display unless it is converted.
Converting is a process called tonemapping, which takes the
wide HDR colors and remaps them to fit in the smaller standard
dynamic range (SDR).

The encoder has three HDR paths, and it picks one based on your
profile and your source.

### Path one: HDR passthrough

Your source is HDR. Your profile targets HEVC 10-bit and does
not ask for tonemap. The encoder keeps the HDR metadata in the
output.

The output plays on an HDR display and looks like the source.
It also plays on an SDR display, but the colors may look washed
out because the player has to do its own tonemap, and player
tonemaps are usually not great.

When the source has Dolby Vision metadata — a layer on top of
HDR10 that carries per-scene color data — the encoder preserves
that too. Four conditions have to hold for Dolby Vision to
survive:

```
has_dolby_vision(source) AND
  output.codec IN {hevc, av1} AND
  output.bit_depth >= 10 AND
  output.container IN {hls, mp4, mkv} AND
  profile.hdr_policy == "passthrough_when_possible"
```

If all four hold, the encoder adds the right container tag (the
DV RPU in HEVC, the `iso6` / `dvh1` codec tag in MP4) and the
metadata comes through.

If any condition fails, Dolby Vision gets stripped. The plan
stage logs a warning so you know:

```
decision: dolby_vision_stripped
reason:   profile targets h264 (no DV support) — metadata dropped
```

### Path two: HDR-to-SDR tonemap

Your source is HDR. Your profile targets 8-bit, or explicitly
enables tonemap. The encoder runs a tonemap filter chain.

Three tonemap implementations are available. The encoder picks
the fastest one your ffmpeg build supports.

**libplacebo (Vulkan).** Fastest. Your graphics card runs the
color math. Handles standard HDR content and preserves detail
well. Filter chain:

```
hwupload,libplacebo=tonemapping=hable:colorspace=bt709:color_primaries=bt709:color_trc=bt709:format=yuv420p,hwdownload,format=yuv420p
```

**tonemap_opencl.** Next fastest. Runs on OpenCL compute. Most
graphics cards support it. Slightly less accurate than
libplacebo but close.

**zscale + tonemap (CPU).** Slowest. Runs without any GPU.
Always works, but substantially slower than the GPU paths.
Filter chain:

```
zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p
```

The default tonemap algorithm is Hable. It preserves dark
detail better than alternatives on most real-world content.
Supported algorithms: `hable`, `mobius`, `reinhard`, `clip`,
`bt2390`. Named after John Hable, who published the curve in a
GDC talk on the Uncharted 2 renderer.

If you want a different algorithm or a custom 3D lookup table,
the profile has an `hdr_options` block:

```json
{
  "hdr_options": {
    "tonemap_algorithm": "bt2390",
    "tonemap_peak_nits": 1000,
    "lut_path": null
  }
}
```

### Path three: SDR-to-HDR

This is the inverse direction. Your source is SDR. Your profile
claims HDR output.

The encoder refuses:

```json
{
  "id": "hdr.inverse_tonemap_unsupported",
  "severity": "error",
  "message": "Inverse tonemapping (SDR → HDR) is not supported. Produces artifacts that look worse than the source.",
  "fix": "To get HDR output, you need an HDR source."
}
```

There is no good way to do it algorithmically. Real HDR grading
is a human decision.

## The 10-bit downgrade guard

Related to HDR is bit depth. Most modern video is encoded in 8
bits per channel. HDR content needs 10 bits or more to
represent the wider range.

Every H.264 hardware encoder is 8-bit only. This is a silicon
constraint. There is no driver update coming that adds 10-bit
H.264 to NVENC.

Before this encoder shipped its 10-bit downgrade guard, a
profile that said "H.264, 10-bit" on an NVENC machine would
produce an empty pixel-format string in the ffmpeg command
line. ffmpeg would either pick the source's format (wrong) or
fail at runtime with an "Invalid pixel format" error.

Now the plan stage checks. If your profile requests 10-bit and
the resolved encoder is 8-bit-only, the output plan downgrades
to 8-bit and records a warning:

```
decision: bit_depth_downgrade
reason:   profile requested 10-bit H.264, h264_nvenc supports 8-bit only
action:   pixel_format=yuv420p (8-bit), bit_depth=8
```

HEVC, AV1, and VP9 hardware encoders support 10-bit natively.
The downgrade only fires on H.264 hardware, and on Apple's HEVC
VideoToolbox encoder which is also 8-bit-only for reasons
inside Apple's silicon.

## The resource monitor

While encodes are running, the encoder tracks live CPU, RAM,
and GPU utilization per running ffmpeg process. Sampled every
couple seconds and surfaced at:

```
GET /api/v1/encoder/hardware/utilization
→ {
    "samples": [
      { "pid": 12345, "variant": "v0-1080p", "cpu_percent": 62, "mem_mb": 890, "gpu_index": 0, "gpu_percent": 94, "gpu_mem_mb": 412 }
    ],
    "gpu_totals": [
      { "index": 0, "vendor": "nvidia", "util_percent": 94, "mem_used_mb": 412, "mem_total_mb": 16384 }
    ],
    "concurrent_nvenc_sessions": 3
  }
```

The scheduler reads these numbers. If an existing encode is
saturating the GPU, the scheduler holds back on starting a new
GPU encode. It might start a CPU encode instead, if one is
queued.

On the dashboard, you can see the current utilization alongside
the queue. If your encoder dashboard shows 95% GPU utilization
and a long queue, you know encodes are landing one after
another. If it shows 20% utilization and a long queue,
something is holding encodes back and you should investigate
(most commonly: source disk I/O, or a concurrent-session cap
from the hardware vendor).

This is the kind of feedback you would never get from a raw
ffmpeg invocation. ffmpeg encodes. It does not schedule. The
encoder layer adds the scheduling.

## What the next page covers

Your machine has been measured. Your HDR path is handled. The
scheduler knows what is running.

The next page covers a different kind of hardware question. The
encoder can also look at your content. Watch it. Learn from it.
And use what it learns to encode more intelligently.
