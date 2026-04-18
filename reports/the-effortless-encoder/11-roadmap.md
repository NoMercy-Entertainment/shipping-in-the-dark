---
title: "What is not shipped, and why"
part: 11
---

# What is not shipped, and why

Every piece of software has the same two halves. The part that
is done, and the part that is not. The honest thing to do at
the end of a report like this one is name the second half, so
the reader knows where the edges are.

## What is shipped

The earlier parts described what works today. As a reminder:

- The four video codec families — H.264, HEVC, AV1, VP9 —
  resolved to the right encoder handle for your hardware.
- The full audio codec lineup — AAC, Opus, FLAC, AC-3, E-AC-3,
  MP3, Vorbis, TrueHD, DTS.
- Text-subtitle routing plus optical character recognition for
  bitmap subtitles (PGS, DVD VobSub, DVB).
- Every output container listed on the codec page, each with
  its own encoding strategy — HLS single and two-pass, DASH
  single and two-pass, MP4 single and two-pass, MKV,
  audio-only MP3 / FLAC / OGG.
- Built-in presets covering the common hardware targets (ten
  on launch, more expected).
- A per-GPU hardware benchmark across CPU and hardware
  encoders.
- A validator with a growing catalogue of rules at profile
  save time. Plus a preview endpoint that adds the source
  file to the picture.
- HDR passthrough, Dolby Vision preservation (profile 5, 7,
  8.1), and tonemap methods for HDR-to-SDR conversion
  (libplacebo, tonemap_opencl, zscale).
- Content analysis — crop detection, intro and outro
  fingerprinting, subtitle OCR, Whisper speech transcription.
- AES-128 HLS encryption for paid-tier content.
- Live transcode for on-the-fly playback to devices that
  cannot decode the stored file.
- Blu Ray and DVD disc ripping via `bluray:` and `dvdread:`
  pseudo URLs.
- The full distributed encoding stack — signed HTTP transport,
  self-registration, health tracking, retry chain, file
  transfer, and progress reporting.

That is what the encoder does today. Now the honest part.

## What is planned but not yet shipped

Each of the following is designed but not yet coded. Each has
a reason for being deferred.

### CENC DASH multi-DRM

This would let the encoder produce DASH streams encrypted with
Common Encryption, consumable by Widevine, PlayReady, and
FairPlay clients. It enables commercial streaming to paid
subscribers on every major client family.

**Deferred because** it needs three things that are not in
the current build:

1. A packager — `mp4box` or `shaka-packager` — for
   segment-level encryption.
2. License-server integration, usually a paid service.
3. Certificate handling per DRM system.

AES-128 HLS covers the home, prosumer, and casual-paywall use
case without this complexity.

### Exponential backoff on distributed retries

The current retry chain tries the next worker immediately on
failure. A smarter implementation would wait a short time
between retries, increasing on each attempt:

```
attempt_1 → 0ms delay
attempt_2 → 500ms delay
attempt_3 → 1500ms delay (+ jitter)
```

**Deferred because** the current behaviour is safe. Failed
tasks fall back to local dispatch. The user's encode still
completes. Nice to have, not release-critical.

### Resumable source fetch

The current HTTP source fetcher streams downloads straight to
disk. A worker crash mid-download discards the partial file.
The next task attempt re-downloads from scratch.

HTTP range requests are already enabled on the coordinator
side. A fancier client could resume using an HTTP `Range:`
header, but the current one does not keep checkpoint state.

**Deferred because** multi-gigabyte downloads across the
open internet are an edge case for now. Most distributed
setups use a shared NAS where source files are visible
locally and no fetch happens.

### Mutual TLS between coordinator and worker

The current security model uses HMAC-signed payloads as the
full authentication story. Works on trusted LAN plus HTTPS to
the coordinator. For untrusted networks, the operator
currently adds a VPN or TLS client-certificate layer
externally.

**Deferred because** getting mutual TLS right is significant
work. Certificate issuance, rotation, revocation, and the
operator experience of keeping the certificate chain healthy.
An external layer covers the network use case today.

### Progress streaming into the main job progress observer

Remote task progress flows into the coordinator's in-memory
progress store. Dashboards read from it. But the main
`EncodingOrchestrator`'s progress observer, which drives the
web client's progress bar, does not yet subscribe to the
store.

**Deferred because** it needs a small wiring change, but the
integration requires matching the progress schema between the
orchestrator and the store. Straightforward work, not yet
prioritized.

### Strategy auto-distribution

This is the biggest remaining integration. The distribution
infrastructure is shipped end to end. Coordinator dispatches.
Worker receives. Health tracking. Progress reporting. All
wired. All tested.

But existing single-machine strategies, such as the HLS
single-pass strategy, still run whole jobs locally. They do
not yet decompose the job into task arrays and dispatch them.

The work needed is per strategy. Each multi-variant strategy
needs to:

```csharp
public class HlsSinglePassStrategy(
    IWorkerDispatcher workerDispatcher,  // NEW constructor param
    ...)
{
    public async Task<EncodingResult> ExecuteAsync(PlanResult plan, CancellationToken ct)
    {
        var tasks = plan.Variants.Select(v => BuildEncodeTask(v, plan)).ToArray();
        var results = await workerDispatcher.DispatchAllAsync(tasks, ct);
        return await FinalizeAsync(results, plan, ct);
    }
}
```

Accept an `IWorkerDispatcher` in the constructor. Build task
arrays from the Plan stage output. Dispatch them in parallel.
Collect the results. Run Finalize locally.

**Deferred because** it is a careful refactor. Each strategy
has its own stitching logic at the Finalize stage. Some
strategies share state across variants, like two-pass stats
files. Getting this right without breaking single-machine
users is the priority.

For now, the dispatcher is exercisable via direct calls,
which is what the end-to-end tests do. And plugin strategies
can wire themselves up today.

### Disc metadata resolution

The disc ripper currently produces MKV files named by title
index. It does not yet auto-resolve metadata like movie title,
director, year, and cover art.

The resolver interface is scaffolded:

```csharp
public interface IDiscMetadataResolver {
    Task<DiscMetadataSuggestion?> ResolveAsync(DiscInfo info, CancellationToken ct);
}
```

The implementation would query TMDB with the main title's
duration plus any disc-embedded metadata, suggest a folder
structure, and let the user confirm before moving.

**Deferred because** accurate matching from duration plus
disc metadata is tricky for edge cases. Criterion special
editions, re-releases with different run times, and similar.
Manual rename is reliable for now.

## Open design questions

A few areas where we have not settled on an answer. These may
shift before they ship.

### Plugin marketplace

Plugins can already register strategies, codec resolvers, and
dispatchers via dependency injection. There is no curated
marketplace yet. Users who want to use a community preset, a
community strategy, or a community health registry have to
install it manually.

The question is whether to build a first-party marketplace, or
to point users at a community registry like a Git repository
or a gist index. A marketplace is a meaningful ongoing
operational commitment.

### CRF scaling as a community tweakable

Currently, the scale from software encoder CRF to hardware
quality parameter is linear proportional. Implementation:

```csharp
int Translate(int sourceCrf, int sourceMax, int targetMax, CodecHint hint) {
    return (int)Math.Round((double)sourceCrf * targetMax / sourceMax);
}
```

The question is whether to expose this as a pluggable
`IQualityScaler`, per-encoder override in `EncoderOptions`, or
per-profile override. Opening it up lets the community publish
perceptual measurements (VMAF, SSIM, PSNR) for specific
hardware and codec pairings.

### Progress streaming transport

The current progress pipeline uses HTTP POST from worker to
coordinator, plus polling from the dashboard. Server-Sent
Events or SignalR would be lower latency, at the cost of
persistent connection state.

The question is whether the latency improvement is worth the
extra complexity. Polling works today.

### Hardware benchmark recalibration cadence

The default recalibration runs after a month. Driver updates
can change throughput before that window elapses. The
question is whether to add driver-version detection that
forces a recalibration when the driver changes. That requires
platform-specific driver queries for each vendor family.

## Known limitations, honest list

Every piece of software has limitations. Here is the list for
this encoder.

**No support for encoder families beyond the four shipped.**
Uncompressed formats like ProRes Raw, RED Raw, and BRAW are
treated as opaque inputs and stream-copied when the container
allows.

**No support for 3D stereoscopic video.** The encoder treats
3D sources as 2D with an unusual aspect ratio.

**High-frame-rate content above 120 fps passes through**, but
the validator does not yet check the codec level's frame-rate
caps.

**VR 180 and 360-degree video** beyond stream copy is not
supported. The encoder does not inject the metadata VR
players need.

**Chapter styling beyond basic title text** is not supported.
Chapter thumbnail extraction is scaffolded but not integrated
with the web player.

**No official support for Windows versions before Windows
10.** The encoder may work there, but we do not test there.

## Contributing

The encoder is part of the open-source NoMercy media server.
Pull requests are welcome. Areas where contributions are
especially valuable.

**New preset definitions** for specific hardware targets.
Someone has a Samsung Frame TV with a weird codec quirk?
Document it as a preset.

**Perceptual CRF scaling curves per encoder.** Someone ran
rigorous VMAF measurements comparing `libsvtav1` CRF 35
against `av1_nvenc` CQ values? Share the data. The
`IQualityScaler` interface is designed for it.

**New language models for subtitle OCR.** Tesseract supports
many languages. Adding new ones is small work per language.

**New content analysis detectors.** Silence detection. Scene
cut detection. Song detection in background music. Any
deterministic signal the planner can use for better encodes.

The source lives on GitHub under the NoMercy Entertainment
organization, in the `nomercy-media-server` repository. Issues
and pull requests go there.

## Final notes

The goal of this report was to show that the encoder is not a
raw ffmpeg wrapper. It is a pipeline with opinions. Those
opinions catch user mistakes before they become broken
encodes. Those opinions pick the fastest encoder that can
deliver the requested quality. Those opinions accept anything
ffmpeg can parse on input, and restrict output to formats
that actually play on target devices.

If any page raised questions this roadmap did not answer, the
project's issue tracker on GitHub is the right place to dig
further.

Thank you for reading.
