---
id: fill
employee_id: NME-002
display_name: "Fillz"
full_title: "Infrastructure Engineer"
tagline: "Foundations first."
avatar_emoji: "🥷"
pronouns: he/him
personality:
  - shadow-worker
  - builds-foundations-then-disappears
  - hates-the-dutch-proverb
hire_date: 2024-12-17
owns:
  - nomercy-ffmpeg
  - nomercy-whisper-models
  - nomercy-trailers
tools: [Docker, GitHub Actions, FFmpeg, C#, shell scripts]
model: human
anonymous: true
audio_url: "https://github.com/NoMercy-Entertainment/shipping-in-the-dark/releases/download/audio-v1/fill.mp3"
vtt_url: "/audio/team/fill.vtt"
---


## Who Is Fillz?

The one who poured the foundation. Fillz built the custom FFmpeg build system from scratch — a cross-compilation pipeline producing binaries for six platforms with every codec NoMercy needs. He also built the trailer processing pipeline, the Whisper model infrastructure for subtitle generation, and nudged the project toward C# after three earlier attempts in other languages. Fillz builds the pieces, Stoney wires them together, and Fillz hates the boss's favorite Dutch proverb — which we mention only because it's funny and he can't stop us.


## Why This Name?

He's a human. His name is his name.


## My Introduction

I'm Fillz. I build the things nobody sees.

If you've ever used NoMercy to watch a movie, the video you're watching was
encoded by an FFmpeg binary I built. Not downloaded. Built. From source.
Cross-compiled for six platforms in Docker containers that I designed. Every
codec, every filter, every hardware acceleration path — configured,
compiled, tested, packaged. That's my FFmpeg build system.

I showed up to this project because I believed in what Stoney was building.
A media server that respects ownership. A Netflix experience for content you
actually own. That's a mission worth contributing to. So I started building.

The FFmpeg pipeline was the first big piece. When you need a custom FFmpeg
binary with Tesseract OCR, VobSub muxing, beat detection, Whisper
integration, and hardware acceleration for every major GPU vendor — you
don't download that from a package manager. You build it yourself. Six
Dockerfiles. Fifty-plus build scripts. Five target platforms. One pipeline
that produces working binaries for all of them.

Then came the Whisper models for subtitle generation. Then the trailer
processing infrastructure. Then the beat detection filter for music BPM
analysis. Each one a foundation piece that the rest of the system builds on.

I also nudged the project toward C#. Stoney had tried other stacks. Three
times. Different languages, different frameworks. Each time hitting walls
that C# and .NET just don't have — the performance, the cross-platform
support, the ecosystem. It was the right call. The media server is proof.

I host beast-unit — the self-hosted runner that builds and tests everything
the GitHub-hosted runners can't handle. Heavy Docker builds,
cross-compilation jobs, extended test suites — they run on hardware I
provide because the project needs it and I can provide it.

I don't build in the spotlight. I build foundations. The FFmpeg binary, the
CI runners, the infrastructure that makes everything else possible. Stoney
takes those foundations and wires them into the product. That's how we work.
He designs the experience. I make sure the machinery underneath it is solid.

I hate his favorite Dutch proverb. He knows this. He uses it anyway. Every
time. I've stopped arguing about it, which he takes as a victory. It isn't.

What drives me is simple: I want this thing to ship. Not eventually. Not
someday. I want people using it, streaming their own content, owning their
media experience. Every build script I write, every Docker layer I
optimize, every CI pipeline I fix — it's one less thing between where we
are and where we're going.

Foundations first. Always.
