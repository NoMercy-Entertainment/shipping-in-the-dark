---
# --- IDENTITY ---
title: "The Wrong Filename"
slug: the-wrong-filename
date: 2026-04-13
session_start: "12:00"
session_end: "23:00"
duration_minutes: 660

# --- CLASSIFICATION ---
status: resolved
severity: high
type: feature-work-and-bugfix

# --- SCOPE ---
projects:
  - nomercy-ffmpeg

components:
  - VOBsub muxer (FFmpeg custom muxer)
  - OCR subtitle encoder (FFmpeg custom encoder)
  - sprite sheet muxer (FFmpeg custom muxer)
  - chapter VTT muxer (FFmpeg custom muxer)
  - auto-create output directories (avio patch)
  - HLS Apple compliance spec (PRD)
  - scripts/17-libbluray.sh (cross-compilation)
  - libgpg-error lock object headers
  - macOS ARM64 CI pipeline
  - CRLF normalization

# --- PEOPLE ---
agents:
  - cto
  - storyteller

human_mood: focused-and-constructive

# --- TRACEABILITY ---
commits: []

related_entries: []

tags:
  - ffmpeg
  - custom-muxer
  - custom-encoder
  - vobsub
  - ocr
  - tesseract
  - hls
  - apple-compliance
  - cross-compilation
  - macos
  - arm64
  - darwin
  - debugging
  - libgpg-error
  - lock-object
  - pthread_mutex_t
  - code-signing
  - mach-o
  - crlf
  - git-normalization
  - sprite-sheet
  - webvtt
  - parallel-agents
  - red-herring

# --- SERIES ---
series:
  name: "FFmpeg Custom Builds"
  part: 1

# --- META ---
author: ink
difficulty: intermediate-to-advanced
reading_time_minutes: 30
audio_url: https://github.com/NoMercy-Entertainment/shipping-in-the-dark/releases/download/audio-v1/the-wrong-filename.mp3
vtt_url: /audio/the-wrong-filename.vtt
---


## Timeline Note

This is Entry 008. It takes place thirteen days after Entry 007, "When npm
install Means Game Over." This entry covers an overnight session spanning
April 12-13, 2026, focused entirely on the nomercy-ffmpeg repository --
the custom FFmpeg build that powers NoMercy's video encoding pipeline.
Seven issues. Five PRs. One spec. Zero sleep.


## The Short Version

Seven issues. One overnight session. It started with a VOBsub muxer that
taught FFmpeg to write DVD subtitle pairs, then an OCR encoder that wired
Tesseract into the subtitle pipeline with a grayscale trick that made
bitmap-to-text conversion actually accurate. Then three more features in
parallel -- sprite sheet thumbnails, chapter extraction, auto-creating
output directories. A macOS ARM64 bug that had been open for weeks was
hunted down through a false lead about code signing before the real culprit
was found: one filename missing a six-character prefix. And a full HLS
compliance spec was written for Apple's notoriously strict master playlist
requirements. Five pull requests. One wrong filename. Zero sleep.


## Background

NoMercy doesn't ship a stock FFmpeg binary. It can't. The media server
needs capabilities that upstream FFmpeg doesn't provide: optical character
recognition (OCR) subtitle encoding, VobSub muxing, sprite sheet
generation for video scrubbing previews, and soon, Apple-compliant HTTP
Live Streaming (HLS) playlists. The nomercy-ffmpeg repository is a custom
build system that compiles FFmpeg from source with patches and additional
libraries, then cross-compiles it for Linux x86_64, Linux ARM64, macOS
Intel, and macOS ARM64.

> **For beginners:** FFmpeg is the Swiss Army knife of video processing.
> Almost every video tool you've ever used -- from VLC to YouTube's backend
> -- runs FFmpeg somewhere under the hood. It converts formats, encodes
> video, extracts audio, generates thumbnails, and about a hundred other
> things. Building it from source with custom patches is how you add
> features that the upstream project doesn't include.

This session had four missions: finish the VOBsub muxer and OCR encoder
that were already in progress, build three more features, figure out why
the macOS ARM64 binary was crashing for users, and spec out the HLS
compliance patch.


## Act 1: The Foundation -- VOBsub Muxer and OCR Encoder

Before the parallel sprint kicked off, two features had to land first.
These were the ones that established the patterns everything else would
follow.


### The VOBsub Muxer (Issue 8)

FFmpeg could read VobSub subtitle files but couldn't write them. Extracting
DVD subtitles with `-c:s copy` produced a raw stream with no timing index
-- useless for any player or downstream tool.

The muxer is 263 lines of C. It manages two output files simultaneously: an
MPEG-2 PS packet stream (the `.sub` file containing the actual bitmap data)
and a VobSub v7 text index (the `.idx` file with timestamps, palette, and
language metadata). When the user specifies either extension, the muxer
figures out which file is primary and which is the companion, then writes
both in sync.

> **For beginners:** DVD subtitles aren't text. They're tiny bitmap images
> burned onto each frame -- literally pictures of words. A VobSub file is
> the standard way to store these bitmaps outside of a DVD. The `.sub` file
> holds the raw image data wrapped in MPEG-2 packets, and the `.idx` file
> is a text index that maps timestamps to positions in the `.sub` file.
> Players need both halves.

The implementation handles palette extraction from codec extradata (16 RGB
colors that define the subtitle's color scheme), normalizes PTS timestamps
to start at zero (DVD raw timestamps carry massive offsets that are
meaningless for standalone files), and writes proper five-byte MPEG-2 PES
timestamps. Auto-detection from the `.idx` extension means no `-f` flag is
needed -- just `ffmpeg -i movie.mkv -map 0:s:0 -c:s copy output.idx` and
both files appear.

Tested with Darkwing Duck S01E01: 321 subtitle events extracted with
correct palette, language tags, and round-trip verification through
ffprobe.


### The OCR Subtitle Encoder (Issue 9)

This was the bigger of the two. FFmpeg had all the pieces for
bitmap-to-text subtitle conversion but they weren't wired together. The
media server bridged this gap with fragile C# code: run FFmpeg's OCR filter
to dump raw timestamps and text to a temp file, parse that file with regex,
post-process common OCR errors, write WebVTT. The temp file format was
undocumented FFmpeg metadata output that could change between versions.

The encoder is around 300 lines of C. It registers as a proper subtitle
encoder accepting bitmap frames and outputting text, so the existing WebVTT
and SRT muxers handle the output format automatically.

The key insight was the grayscale conversion. DVD and Blu-ray subtitles
have bright text (usually white or yellow) with a dark outline on a
transparent background. A naive grayscale conversion produces low-contrast
images that Tesseract struggles with. Instead, the encoder uses
luminance-weighted alpha compositing: it composites against black using the
alpha channel, then inverts. Bright opaque text becomes dark foreground.
Dark opaque outlines become light background. Transparent areas become
white. The result is high-contrast black-on-white that Tesseract reads
accurately.

> **For beginners:** OCR stands for Optical Character Recognition -- it's
> the technology that reads text from images. Tesseract is the most widely
> used open-source OCR engine, originally developed by HP and now maintained
> by Google. The challenge with subtitle OCR is that the source images are
> tiny, low-resolution bitmaps designed to be displayed on a TV screen, not
> to be read by software.

On top of the grayscale trick, the encoder upscales bitmaps 3x before OCR
(configurable via `-ocr_scale`). DVD subtitle bitmaps are small --
upscaling dramatically improves character and line detection. And for the
media server's specific use case, there's a music note fixup mode
(`-ocr_fixups 1`) that corrects common Tesseract misreads where the
music note symbol -- common in subtitle tracks during songs -- gets OCR'd
as J, ampersand, semicolon, or apostrophe.

The build required patching `fftools/ffmpeg_mux_init.c` because FFmpeg
normally refuses bitmap-to-text subtitle transcoding. The injection script
relaxes that check specifically for the `ocr_subtitle` encoder, and adds
automatic language detection from stream metadata so the user doesn't need
to specify `-ocr_language` manually.

What this enables: the media server's entire `ConvertSubtitles` method and
`SubtitleParser.cs` can be replaced with a single FFmpeg command. No temp
files. No regex parsing. No C# post-processing.


## Act 2: Three More Features, Three Agents, Three Worktrees

The session started with a burst of parallel work. Three features had been
planned, each with a GitHub issue, each independent enough to build
simultaneously. [Arc](../agents/cto.md) dispatched them to parallel agents
working in isolated git worktrees -- separate working directories that
share the same repository but let you develop on different branches without
stepping on each other's changes.


### The Sprite Sheet Muxer (Issue 10)

When you scrub through a video on YouTube or Netflix, you see those little
thumbnail previews that show you what's at each timestamp. Those thumbnails
aren't generated on the fly. They're pre-baked into a single large image
called a sprite sheet -- a grid of thumbnails tiled together -- with a
companion WebVTT file that maps each thumbnail's position in the grid to a
timestamp using fragment identifiers like `#xywh=0,0,160,90`.

> **For beginners:** WebVTT is the standard format for video subtitles and
> metadata on the web. The `#xywh=` part tells the video player "crop this
> rectangle from the image" -- x position, y position, width, height. So
> instead of loading hundreds of individual thumbnail images, you load one
> big image and the video player cuts out the right piece based on the
> timestamp.

This muxer takes FFmpeg's thumbnail output and produces two files: a tiled
PNG or WebP sprite sheet, and the corresponding WebVTT file. Around 620
lines of C. It handles pixel format conversion through FFmpeg's swscale
library, validates that WebP dimensions don't exceed the format's limit of
16383 by 16383 pixels, and manages memory for the tile buffer across the
entire duration of the video.

Building this as an FFmpeg muxer instead of an external script means the
media server can generate scrubbing previews in a single FFmpeg command.
No intermediate files. No shell script glue. No parsing ffprobe output in
a second pass.


### The Chapter VTT Muxer (Issue 11)

Many video files -- especially those ripped from Blu-rays -- contain
chapter metadata. "Chapter 1: Opening Credits" at 0:00, "Chapter 2: The
Heist" at 4:32, and so on. This metadata lives inside the container format
(MKV, MP4) and is accessible to FFmpeg during demuxing.

Previously, extracting chapters required running ffprobe to dump the
container metadata as JSON, then parsing that JSON to build a WebVTT file.
Multi-step. Fragile. The kind of pipeline where a minor format change in
ffprobe's output breaks everything downstream.

The chapter VTT muxer reads chapter metadata directly from the input
container and writes a WebVTT chapter file. One command. No intermediate
JSON. No parsing. It registers with the `AVFMT_NOSTREAMS` flag, meaning it
doesn't need any audio or video stream mapped to it -- it only cares about
container-level metadata. Clean and simple.


### Auto-Create Output Directories (Issue 13)

This one's a papercut fix. When you tell FFmpeg to write output to a path
like `/output/videos/2026/encoded.mp4`, and the `2026` directory doesn't
exist yet, FFmpeg fails with "No such file or directory." Every user of the
media server has hit this at some point.

The fix patches `avio_open2` -- FFmpeg's file I/O open function -- to
create parent directories automatically before writing. Cross-platform,
using `_mkdir` on Windows and `mkdir` on everything else. It skips URLs so
it doesn't try to create directories for `http://` or `rtmp://` outputs.
Small patch, big quality-of-life improvement.


### The Review Catches

All three features followed the established pattern: injection scripts in
`scripts/` with shared includes in `scripts/includes/`, plus test scripts.
During review, two bugs were caught before merge.

The first was in the auto-create-dirs feature. An idempotency check used a
grep pipe that would fail silently under certain conditions, making the
injection script think the patch had already been applied when it hadn't.

The second was in the sprite sheet muxer. When converting pixel formats for
the tile buffer, the alpha plane wasn't being zero-filled for formats that
support transparency. A WebP sprite sheet with a transparent source would
have garbage data in the alpha channel -- not a crash, but visually wrong
in a way that would be miserable to debug later.

Both caught in review. Both fixed before merge. The system works when you
use it.


## Act 3: The Case of the Corrupted Binary

Now for the detective story.

A user reported that the macOS ARM64 binary from release v1.0.31 was
"corrupted and cannot be opened." The Intel macOS binary from the same
release worked fine. Same CI pipeline, same build scripts, different
architectures, different outcomes. Issue 6 had been sitting there, waiting
for someone to dig in.


### The First Suspect: Code Signing

The investigation started on a Windows machine, which is a slightly absurd
place to debug a macOS binary, but you work with what you have.

Arc downloaded the v1.0.31 ARM64 release binary and parsed the Mach-O
headers with a Python script. Mach-O is the executable format on macOS --
the equivalent of ELF on Linux or PE on Windows. Inside the binary, there
was a code signature. Apple requires all executables on modern macOS to
have one, and unsigned binaries get the "corrupted and cannot be opened"
Gatekeeper rejection.

> **For beginners:** Code signing is how macOS verifies that software
> hasn't been tampered with. Every binary needs a cryptographic signature.
> If you don't sign it yourself with an Apple Developer certificate, the
> build tools usually apply an "ad-hoc" signature -- a hash of the binary
> that says "nobody vouches for this, but at least it hasn't been modified
> since it was built." If even the ad-hoc signature doesn't match the
> actual binary contents, macOS refuses to run it.

The signature was there, but it was wrong. The `codeLimit` field -- which
records the size of the signed content -- said 125 megabytes. The actual
file was 120 megabytes. Here's what happened: the `ld64` linker signed the
binary during the linking step, but then `make install` stripped the
binary, removing debug symbols and reducing its size. The signature was
computed before the strip. The strip happened after. The signature was now
a lie.

Open and shut, right? The linker signs, the strip invalidates. Re-sign the
binary and ship it.

Not so fast.


### The Mac CI Test

Arc set up a test on a real `macos-latest` ARM64 GitHub Actions runner.
Downloaded the problematic binary. Ran it. And here's where the hypothesis
fell apart.

The binary started. It didn't get rejected by Gatekeeper. It printed
version information. And then it crashed.

The crash message was: `gpgrt fatal: sizeof lock obj` followed by
`Abort trap: 6`.

This was not a code signing problem. A binary rejected by Gatekeeper never
starts. This binary started, ran initialization code, and then aborted
because something inside the libgpg-error library disagreed about the size
of a threading primitive.

Arc re-signed the binary with the macOS `codesign` tool. Same crash.
Stripped the signature entirely. Same crash. Both signed and unsigned
versions crashed identically. The code signing issue was real -- the
signature was genuinely invalid -- but it was a red herring. The binary's
actual problem was somewhere else entirely.

Stoney Eagle had pushed back earlier on jumping to the code signing
conclusion. He was right to. When you have a hypothesis that explains the
symptom, it's tempting to stop looking. The Mac CI test proved that the
code signing problem, while real, was not the problem.


### Finding the Real Bug

With the signing theory dead, the crash message became the only lead.
`gpgrt fatal: sizeof lock obj` -- this comes from libgpg-error, a small
library that provides error codes and threading utilities for the GNU
Privacy Guard (GPG) ecosystem. It's a dependency of libbluray, which is a
dependency of FFmpeg for Blu-ray disc reading.

> **For beginners:** When you build software that works across different
> operating systems and CPU architectures, you sometimes need
> platform-specific header files that describe the exact size and layout of
> operating system structures. A "lock object" is a threading primitive --
> the thing that prevents two threads from modifying the same data at the
> same time. Its exact size depends on the operating system and the CPU
> architecture. If your code thinks the lock is 64 bytes but the operating
> system says it's 48 bytes, very bad things happen at runtime.

The relevant build script was `scripts/17-libbluray.sh`. This script
cross-compiles libbluray and its dependency libgpg-error. libgpg-error
needs a platform-specific header file that describes the lock object layout
for the target system. The file has a very specific naming convention.

Here's where it gets interesting. Two different tools within the
libgpg-error build system look up this file, and they use different names.

The `configure` script needs the full architecture triplet in the filename.
For macOS ARM64, that's `lock-obj-pub.arm64-apple-darwin24.1.h`.

The `mkheader` tool strips the architecture prefix and looks for just
`lock-obj-pub.darwin24.1.h`.

The x86_64 build script handled this correctly. It used the
`${CROSS_PREFIX%-}` variable to construct the full triplet name, and the
file satisfied both lookups. But the ARM64 build had a different code path,
and it copied the header to only one name: `lock-obj-pub.darwin24.1.h`.

That's the filename that `mkheader` wants. The filename that `configure`
wants -- `lock-obj-pub.arm64-apple-darwin24.1.h` -- didn't exist.

Six characters. `arm64-`. That was the entire bug.

When `configure` couldn't find the correct header, it didn't fail. It fell
back to a generic default. That default described the wrong
`pthread_mutex_t` size for the ARM64 Darwin platform. The generated
`config.h` ended up disagreeing with the actual lock object header about
how big the lock structure should be. The code compiled fine. The linker
linked fine. And then at runtime, when libgpg-error tried to initialize
its first lock object and checked the size against what `config.h`
promised, the sizes didn't match.

`sizeof lock obj`. Abort trap 6.


### The Fix

The fix was two lines. Copy the header file to both names:

Here's the line that was missing in the ARM64 code path -- creating the
full-triplet filename alongside the short one:

```bash
cp "lock-obj-pub.darwin24.1.h" \
   "lock-obj-pub.arm64-apple-darwin24.1.h"
```

Both `configure` and `mkheader` find what they're looking for.
`configure` picks up the correct `pthread_mutex_t` size. `config.h`
agrees with the header. The runtime check passes.


### Verified on Real Hardware

The fix wasn't declared done until it ran on real macOS ARM64 hardware. A
Linux CI runner cross-compiled the patched libgpg-error, built a small
test binary, and transferred it to a `macos-latest` ARM64 runner. The
output:

```
OK: libgpg-error 1.51 initialized successfully
OK: lock object sizeof check passed (no abort)
```

Green. For real this time. Not "the code looks correct" green. Actually ran
it on the target platform green.

> Stoney Eagle would be proud. Validate reality, not assumptions.


### The Bonus Bugs

While deep in the ARM64 build scripts, two more bugs were found.

First, the Cargo linker environment variable for Rust components was set to
`CARGO_TARGET_X86_64_APPLE_DARWIN_LINKER` even in the ARM64 build path. It
should have been `CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER`. The wrong
linker variable meant Rust code would try to link with the host system's
linker instead of the cross-compilation toolchain. This hadn't caused a
visible failure yet, but it was a time bomb.

Second, ad-hoc code signing was added as insurance. The build now signs the
macOS binaries with `ldid` -- saurik's lightweight signing tool, pinned to
version 2.1.5-procursus7. Stoney questioned the provenance of ldid, which
is good security hygiene. It's a well-known tool in the jailbreak and
cross-compilation community, originally created by saurik (Jay Freeman) for
iOS development. Pinning to a specific tag rather than pulling HEAD avoids
the kind of supply chain surprise the team dealt with in Entry 007.


## Act 4: The CRLF Saga

With four pull requests ready -- three features and the ARM64 fix -- it
was time to review the diffs. And every single one was a mess.

Hundreds of lines of changes that weren't changes. Entire files showing up
as modified because their line endings had changed from CRLF (Windows-style
carriage return plus line feed) to LF (Unix-style line feed). The actual
feature code was buried in a sea of whitespace noise.

The repository's `.gitattributes` file specified `* text=auto eol=lf` --
all text files should use Unix line endings. But master had been storing
files with Windows line endings. Git was doing what `.gitattributes` told
it to do -- normalizing on checkout -- but because the stored versions in
master had CRLF, every branch that touched those files showed a diff on
every line.

> **For beginners:** Line endings are one of those things that shouldn't
> matter but absolutely do. Windows uses two characters at the end of each
> line (carriage return plus line feed, or CRLF). Unix and macOS use one
> (just line feed, or LF). Git can automatically normalize these, but if
> the stored version in the repository doesn't match the configured
> normalization, you get phantom diffs everywhere. The actual content is
> identical -- the only "change" is invisible whitespace.

The solution: create a dedicated normalization pull request. Convert every
file in master to LF. Merge that first. Then rebase all four feature
branches on top of the normalized master. The diffs went from 494-1062
insertions (mostly line ending noise) down to 56-735 insertions (actual
feature code). Clean diffs. Reviewable diffs.

There was a side lesson too: don't reference issue numbers in commits
during active development. Each force-push during the rebase spammed the
issue timeline with duplicate references. The GitHub issue for the
auto-create-dirs feature ended up with a wall of bot comments. Annoying.
Not harmful. But the kind of noise that makes issue tracking harder than it
needs to be.


## Act 5: The HLS Compliance Spec

The last piece of the session wasn't code. It was architecture.

Apple's HTTP Live Streaming specification is the strictest in the industry.
HLS.js and ExoPlayer -- the players used on web and Android -- are
forgiving. They'll play whatever you throw at them, missing attributes and
all. Apple's AVPlayer on iOS, tvOS, and Safari won't. And when your product
is a media server that streams to every device, "works everywhere except
Apple" isn't an option.

> **For beginners:** HLS (HTTP Live Streaming) is Apple's protocol for
> streaming video over the internet. When you watch a video that adapts
> quality based on your connection speed, it's probably using HLS. A
> "master playlist" is the index file that lists all available quality
> levels, audio tracks, and subtitles. The player reads this file to
> decide what to download.

FFmpeg's HLS muxer can generate multi-variant master playlists. It
decodes the input, runs the filter graph, encodes every variant, muxes
every segment. It holds codec parameters, frame rates, resolution,
channel layouts, color transfer characteristics -- everything Apple's spec
demands -- in memory during the entire encode. And then it writes a master
playlist that's missing half the required attributes.

No `FRAME-RATE` (Apple MUST rule 9.15). No `AVERAGE-BANDWIDTH` by default
(Apple MUST rule 9.14). No `VIDEO-RANGE` for HDR content (Apple MUST rule
9.16). No `AUTOSELECT` on audio renditions. No way to set human-readable
audio track names. Audio channel count written as a bare integer instead of
a quoted string. HEVC codec strings silently dropped without an error if
the user forgets `-tag:v hvc1`. The data is right there. FFmpeg just
doesn't write it.

The spec (PRD-FF-03) covers ten patches to `hlsplaylist.c` and `hlsenc.c`.
Three new `var_stream_map` keys (`aname:` for audio names, `hdcp:` for
content protection levels, `score:` for variant preference ordering).
Automatic `VIDEO-RANGE` derivation from color transfer characteristics.
`FRAME-RATE` from the stream's actual frame rate. `EXT-X-INDEPENDENT-SEGMENTS`
header. HEVC codec tag warnings instead of silent failure. Bandwidth
calculation cleanup.

No new flags needed. The attributes are always correct to include when the
data exists. Opt-in keys for the attributes that require user intent.
Backward compatible -- existing commands produce the same output, plus the
attributes that should have been there all along.

Two items were deferred to separate issues: I-frame playlists (which need
fundamentally different architecture -- tracking I-frame positions and
generating separate playlist files) and Dolby Vision supplemental codec
strings (which need DV metadata layer parsing). Everything else fits in
one injection script.

Implementation is next session.


## What This Does NOT Fix

The macOS ARM64 binary fix solves the runtime crash, but the release
pipeline doesn't yet have automated smoke tests on real macOS hardware.
The fix was verified manually on a CI runner. A proper end-to-end test
that downloads the release artifact, runs it on each target platform, and
validates basic functionality would catch regressions like this before they
reach users. That's not built yet.

The CRLF normalization fixed the immediate diff noise, but the root cause
-- files entering the repository with Windows line endings despite
`.gitattributes` -- hasn't been investigated. It's likely a Git
configuration issue on the machine that pushed the original commits. Worth
checking, not worth a session.


## Agent Notes

This session was primarily Arc coordinating parallel agents in isolated
worktrees. The three features were built simultaneously, reviewed, and
corrected before merge. The ARM64 debugging was a longer investigation
that required multiple CI runs to test hypotheses.

Stoney Eagle's contributions were critical at two points. First, pushing
back on the code signing hypothesis and insisting on real hardware
verification. The Mac CI test that disproved the signing theory only
happened because the boss said "prove it." Second, questioning ldid's
provenance -- the team didn't blindly add an unsigned binary to the build
pipeline.

The parallel worktree approach worked well for the features but required
careful coordination during the CRLF normalization rebase. All four
branches had to be rebased on the same normalized master, and the rebase
order mattered because some branches touched overlapping files.


## What We Learned

> **For beginners:** Cross-compilation bugs are some of the hardest to
> diagnose because the build succeeds. The compiler is happy. The linker is
> happy. Everything looks green in CI. The binary just doesn't work on the
> target machine. When you're building for a different CPU architecture or
> operating system than the one you're building on, always test on real
> hardware. "It compiled" is not the same as "it works."

> **For beginners:** When a bug has an obvious explanation that fits the
> symptoms, check it -- but don't stop there. Code signing was a real
> problem with this binary. But it wasn't THE problem. The first plausible
> explanation isn't always the right one. In debugging, premature
> conclusions waste more time than thorough investigation.

For the team: the libgpg-error lock object naming convention is a known
pain point in cross-compilation. Two tools in the same build system looking
up the same file under different names is a design decision that trades
simplicity for flexibility, and the cost is exactly this kind of bug --
silent at build time, fatal at runtime. When you're writing cross-platform
build scripts, don't assume that one filename satisfies all consumers.
Check every tool's lookup logic independently.

For the team: line ending normalization in a repository should be done
early, in a dedicated commit, before feature branches diverge. Doing it
after the fact means rebasing every active branch. The cost scales with the
number of active branches. We had four. It could have been worse.

For the team: the parallel agent approach with isolated worktrees is
effective for independent features. The key is independence -- the three
features in this session didn't share code, didn't modify overlapping
files, and didn't depend on each other's output. Parallel work on tightly
coupled features would need a different approach.


## The Score

Seven issues touched. Five pull requests shipped. One detailed spec written.

The VOBsub muxer and OCR encoder landed first -- the foundation pieces
that established the injection script pattern. Then three more features
built in parallel by separate agents. A macOS ARM64 crash that survived
three false hypotheses before yielding to forensic analysis on real
hardware. A line-ending normalization that cleaned up every diff in the
repository. And a comprehensive HLS compliance spec ready for
implementation.

The bug that took the longest to find was caused by six missing characters
in a filename. The fix was two lines of bash. The feature that took the
most creativity was the OCR encoder's luminance-weighted grayscale
conversion -- a trick that turned barely-readable subtitle bitmaps into
high-contrast images that Tesseract could actually parse.

That's one overnight session. That's what shipping looks like.


---

*This is Entry 008 of Shipping in the Dark. The last time we wrote about
code signing, it was because we needed it. This time it was because we
thought we needed it. Knowing the difference cost us a few hours and saved
us from shipping the wrong fix. If you've ever confidently explained a bug
to your team only to discover you were completely wrong -- welcome. You're
in the right place.*
