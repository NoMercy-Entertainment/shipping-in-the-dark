---
title: "The codec maze"
part: 2
---

# The codec maze

Here is a thing most people do not realize when they start
playing with video. When someone says "H.264", they do not mean
one specific piece of software. They mean a family of software
that all produce H.264 output, but through completely different
implementations, with completely different options.

Think of it like saying "I want a coffee." Sure. Espresso? Drip?
Cold brew? Pour over? French press? The drink at the end has
roughly the same caffeine content, but the machine that made it,
the time it took, the flavor profile, those are all different.

H.264 is like that. Multiple encoders can produce it, each with
its own personality. The encoder has to pick one for you,
because you should not have to know the difference.

## Four families, many encoders

At the output layer, the encoder supports four video codec
families: H.264, H.265 (HEVC), AV1, and VP9. Inside each family,
multiple concrete encoders exist, one per hardware vendor plus
software.

Here is the full table of what actually ships as a usable
output encoder today:

| Family | Software          | NVIDIA       | AMD          | Intel QSV     | Intel VAAPI    | Apple VideoToolbox |
|--------|-------------------|--------------|--------------|---------------|----------------|--------------------|
| H.264  | `libx264`         | `h264_nvenc` | `h264_amf`   | `h264_qsv`    | `h264_vaapi`   | `h264_videotoolbox` |
| HEVC   | `libx265`         | `hevc_nvenc` | `hevc_amf`   | `hevc_qsv`    | `hevc_vaapi`   | `hevc_videotoolbox` |
| AV1    | `libsvtav1`, `libaom-av1`, `librav1e` | `av1_nvenc`  | `av1_amf`    | `av1_qsv`     | `av1_vaapi`    | —                  |
| VP9    | `libvpx-vp9`      | —            | —            | `vp9_qsv`     | `vp9_vaapi`    | —                  |

Twenty-two encoder handles across four families. If you point
ffmpeg at a source and say `-c:v h264_nvenc` you get NVIDIA's
hardware H.264. If you say `-c:v libx264` you get the software
one. Same format out, different machinery, wildly different
speed and quality characteristics.

For H.264 there are six available encoders. For HEVC the same
six, all ending in `_265` or `_hevc`. For AV1 there are seven —
three software encoders (SVT-AV1, AOM AV1, rav1e) plus four
hardware ones. For VP9 there are three — one software encoder
plus Intel's two hardware ones. NVIDIA and AMD never shipped VP9
hardware encoders, because the format did not reach mass
adoption before AV1 arrived.

## How the plan stage picks

When you save a profile that says "I want H.264", the encoder
looks at what your machine can do. Resolution order:

1. If the profile pins a specific encoder handle
   (`"encoder_handle": "h264_nvenc"`), that wins.
2. Otherwise, consult the speed index for this machine. The
   speed index is a table keyed by (codec, encoder_handle,
   resolution, gpu_index), populated during the first-boot
   benchmark.
3. Apply user policy:
   - `prefer_hardware`: pick the hardware encoder with the
     highest speed_index for this resolution.
   - `prefer_quality`: pick software, regardless of speed.
   - `force_hardware`: pick hardware or fail.
   - `force_software`: pick software only.
4. If the chosen encoder cannot support a required feature
   (10-bit on NVIDIA H.264, HDR on most hardware H.264
   encoders), fall back to the next option and log the
   fallback.

The fallback decision is recorded in the plan's `decisions_log`.
You can inspect it after the encode:

```
$ curl http://localhost:7626/api/v1/encoder/jobs/abc123/plan | jq .decisions_log
[
  "profile prefers hardware; speed_index[h264][h264_nvenc][1080p][gpu0]=320 fps",
  "bit_depth requested=10, h264_nvenc supports only 8 → downgrading plan to 8-bit (warning recorded)",
  "final selection: h264_nvenc on gpu0"
]
```

The point is, you wrote "H.264" once. The encoder does the rest.

## The quirks are real

Here is where things get sticky. You cannot pretend all these
encoders are the same. They differ in ways that matter.

Some examples.

**NVIDIA's H.264 encoder cannot do 10-bit output.** Not will
not, cannot. The silicon does not support it. If your profile
says 10-bit H.264, the encoder has to either run on software,
or quietly drop to 8-bit. We chose to warn loudly and drop,
based on the profile's `bit_depth_policy`:

```json
{
  "bit_depth_policy": "warn_and_downgrade"
}
```

Other allowed values: `strict` (fail if the resolved encoder
cannot do the requested bit depth), `prefer_software` (switch
to software), and `silent_downgrade` (do not warn).

**Intel's Quick Sync encoder has a quality range of 1 to 51
instead of the usual 0 to 51.** Off by one. If your profile
says CRF 0, the encoder will not accept it. The validator
catches that before the encode runs.

**Apple's VideoToolbox uses a totally different scale, 0 to
100.** Feeding it a CRF value in the 0 to 51 range produces
wildly different output than what you meant. So the encoder
translates. If you write CRF 23 and VideoToolbox is picked, the
translation is:

```
vt_crf = round(23 / 51 * 100) = 45
```

Which is roughly the equivalent quality level on VideoToolbox's
scale.

**AMD's AV1 encoder uses 0 to 255 for its quality range instead
of 0 to 63 like every software AV1 encoder.** Off by a factor
of four. The encoder translates that too:

```
amf_av1_qp = round(crf * 255 / 63)
```

You did not have to know any of this. You wrote `"crf": 23`.
The encoder figured out where on each scale that landed.

## Quality translation, in practice

The full translation table used today:

| Source scale        | Target scale         | Target encoder(s)                |
|---------------------|----------------------|----------------------------------|
| CRF 0-51            | CRF 1-51             | `h264_qsv`, `hevc_qsv`           |
| CRF 0-51            | CQ 0-51              | `h264_nvenc`, `hevc_nvenc`       |
| CRF 0-51            | QP 0-100             | `h264_videotoolbox`, `hevc_videotoolbox` |
| CRF 0-63            | QP 0-255             | `av1_amf`                        |
| CRF 0-63            | CQ 0-63              | `av1_nvenc`, `av1_qsv`           |

The translation uses linear proportional math today. It is not
perceptually perfect, because the perceived quality is not
linear on any of these scales. But it is orders of magnitude
closer than doing nothing, which is what most encoders do.

One of the open questions on our roadmap is whether to let the
community publish better scaling curves. Someone who ran
rigorous quality measurements (VMAF, SSIM, PSNR) comparing
encoders could contribute a scaling curve that fits their
hardware and content better than our linear default. The
interface is `IQualityScaler`:

```csharp
public interface IQualityScaler {
    int Translate(int sourceCrf, int sourceMax, int targetMax, CodecHint hint);
}
```

Plug in a better implementation via dependency injection and
the plan stage picks it up. The default is `LinearQualityScaler`.

## Audio is a smaller menu

Where video has many encoder handles, audio is simpler.

| Codec  | Encoder handle | Typical use                              |
|--------|----------------|------------------------------------------|
| AAC    | `aac`          | Most streaming, Apple default            |
| Opus   | `libopus`      | Best quality-per-bit at low bitrates     |
| FLAC   | `flac`         | Lossless archival                        |
| AC-3   | `ac3`          | Dolby Digital surround, disc sources     |
| E-AC-3 | `eac3`         | Dolby Digital Plus, optional Atmos layer |
| MP3    | `libmp3lame`   | Legacy, stereo only                      |
| Vorbis | `libvorbis`    | Open AAC alternative                     |
| TrueHD | `truehd`       | Dolby lossless surround                  |
| DTS    | `dca`          | Competing lossless surround              |

Audio encoders are just software. There is no Apple audio
encoder that works differently from the AMD audio encoder. AAC
is AAC. So the encoder just picks the best implementation of
each codec and stays with it.

## Why we limit output formats

The encoder accepts anything on input. If ffmpeg can read it,
the encoder will try to encode it.

But we limit what we produce. You cannot ask the encoder to
output RealVideo from 2002. You cannot ask for Cinepak. You
cannot ask for Theora, even though it is technically open
source and technically decent.

The reason is a thing we keep coming back to. Every output
format we support is another set of edge cases, another set of
player compatibility stories, another set of bugs to chase. The
benefit of supporting it has to exceed the cost of maintaining
it.

The four codec families we ship cover the overwhelming majority
of modern playback use cases. Adding the rest would serve the
long tail. Given the trade-offs, we said no to the long tail —
for now. A plugin can add a fifth family if someone needs it
badly enough to write and maintain that code.

## Containers

A codec is the encoding. A container is the file format that
holds the encoded bits.

You can have H.264 video in an MP4 container, an MKV container,
or an HLS playlist. The audio and video are the same. The
container is the wrapper.

The encoder produces seven container families:

| Container | Codecs allowed (video)              | Codecs allowed (audio)                |
|-----------|--------------------------------------|----------------------------------------|
| HLS       | H.264, HEVC, AV1                    | AAC, AC-3, E-AC-3, Opus (TS segments) |
| DASH      | H.264, HEVC, AV1, VP9               | AAC, Opus, E-AC-3                      |
| MP4       | H.264, HEVC, AV1                    | AAC, AC-3, E-AC-3, FLAC                |
| MKV       | anything                            | anything                               |
| MP3       | —                                    | MP3                                    |
| FLAC      | —                                    | FLAC                                   |
| OGG       | —                                    | Vorbis, Opus, FLAC                     |

Each container has its own quirks about what codecs it will
hold. A common pitfall: an `.mp4` container with VP9 video.
Technically the ISO standard has a VP9-in-MP4 box definition,
but most players never implemented it. ffmpeg will happily mux
it. Most players will fail to play it. The safety net catches
this before the encode runs.

## What the next page covers

You now know that the encoder has to translate between the
codec family you asked for and the specific encoder that will
produce it. The next page covers how you tell the encoder what
you want in the first place. Profiles. How to describe intent,
without having to spell out every flag.
