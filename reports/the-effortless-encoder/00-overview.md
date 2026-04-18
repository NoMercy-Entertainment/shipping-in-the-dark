---
title: "Why we built our own encoder"
part: 0
---

# Why we built our own encoder

Picture this. You own a movie. Not a streaming license, an actual
file on your own hard drive. You bought it, you ripped it, it is
yours.

You want to watch it on your phone. Your phone is an iPhone. Your
movie is a 4K Blu Ray rip with Dolby Vision, 7.1 audio, and
subtitles. Your home network is great, your wifi is fine, and you
are sitting on your couch.

And yet, the movie does not play.

Maybe the codec is wrong for your phone. Maybe the resolution is
too big. Maybe the subtitles are in a format your player cannot
read. Maybe the whole file format is a container your phone
refuses to open.

Every person who has tried to run their own media server has hit
some version of this wall. The usual answer is to download a tool
called ffmpeg, learn about codecs for three weeks, write a shell
script with many flags, and hope it works. When it does not work,
you read a forum post from a decade ago, try a flag, see the
error change, try another flag, and eventually give up.

We did not want to give up. So we built an encoder.

## What the encoder does, in plain words

It takes a movie file, or a TV episode, or a disc you just put in
your drive. And it produces a version of that content that plays
on whatever device you hand it to. Your phone. Your laptop. Your
Apple TV. Your big TV in the living room.

That is the promise on the tin. The rest of this report is about
how that promise gets kept. The details matter, because video
encoding is genuinely complicated under the surface. The encoder's
job is to hide that complexity from you, and only show it when
you ask.

If you already know ffmpeg, this report will show you the exact
flags, the exact manifest tags, the exact rate-control curves and
hardware quirks the encoder handles. If you do not know ffmpeg,
the report still works — start at page one, keep reading, and by
the end you will know more about video encoding than most people
in the industry.

## The thing we replaced

We had an earlier version of this encoder. It worked. It shipped.
It also had a tight grip on every assumption we had about
encoding at the time it was built, and loosening that grip was
not possible without a full rewrite.

The earlier version assumed a single machine. It assumed one
encoder per job. It assumed software video encoding would be the
common case. It baked hardware encoder selection into the same
code paths as software. It treated profiles as loose bags of
flags. It did not separate validation from execution. It did not
have a plan stage that could be inspected before the encode ran.

The current encoder is the second system. Same problem, new
architecture. If you are a user who has been with the project
from the beginning, the surface looks similar — you still pick a
profile, you still point it at a file, you still get playable
output. The machinery underneath is different. The rest of this
report shows you what that machinery looks like, and why each
piece is where it is.

## The people who need this

Three kinds of people show up to something like this.

The first is a home server owner. They have a collection of
movies, some TV shows, maybe a music library, and they want to
watch them on their own terms. They do not want to pay a monthly
fee for access to content they already own. They do not want to
worry about a streaming service removing a title tomorrow. They
just want to watch their stuff, on their devices, reliably.

The second is a small studio editor. They work with video
professionally. They make their living producing content. And
they need the output they ship to clients to just work. Every
time. No calls at midnight from a client saying the video will
not play on their phone. No weird color shifts on the client's
review screen. Just reliable output across every device their
client might use.

The third is someone with more than one computer and some
ambition. Maybe a home lab. Maybe a shop with a few machines.
They have encoding work to do, and they do not want just one
machine to carry the whole load while the others sit idle. They
want to spread the work across the fleet. And they would like
the fleet to self-heal if one node drops out.

This encoder is for all three.

## A glimpse at the shape of things

Before we dive into the pipeline, the codecs, the hardware, and
the rest, it helps to see a single concrete artifact. Here is a
real encoding profile, as it lives in the database:

```json
{
  "id": "general-1080p-fast",
  "name": "General 1080p Fast",
  "container": "hls",
  "encode_mode": "single_pass",
  "auto_ladder": true,
  "auto_detect_crop": true,
  "video_profiles": [
    {
      "codec": "h264",
      "width": 1920,
      "height": 1080,
      "crf": 23,
      "preset": "medium",
      "profile": "high",
      "level": "4.2",
      "pixel_format": "yuv420p",
      "keyframe_interval_seconds": 2
    }
  ],
  "audio_profiles": [
    {
      "codec": "aac",
      "channels": 2,
      "sample_rate": 48000,
      "bitrate_kbps": 192,
      "languages": ["en", "ja", "fr"]
    }
  ],
  "subtitle_profiles": [
    {
      "mode": "extract",
      "codec": "webvtt",
      "languages": ["en"]
    }
  ]
}
```

That is the whole input. The encoder takes this, combines it with
whatever source file you point at, and produces a complete HLS
package — master playlist, per-variant playlists, segment files,
and sidecar subtitle playlists — that plays on every HLS client
in existence.

No flags. No filter chain. No preset lookup. You wrote your
intent. The encoder translated it.

How that translation works — the stages, the decisions, the
hardware-aware rate control, the HLS manifest assembly, the
subtitle conversion, the encryption — is what this report
covers.

## The developer side, briefly

The person who built this is one human. He worked on it for
years. He does not have a team of video engineers behind him. He
is not at a big tech company with infinite compute. He is one
person with strong opinions about how media ownership should
work, and a willingness to keep going long after most people
would have stopped.

That shapes the design in ways that matter.

Every feature has to earn its place. If something is in the
encoder, it is because a real user hit a real problem, and there
was no reasonable alternative. Nothing is here to be impressive.
Every line of code has to justify the cost of maintaining it.

The safety net is non-negotiable. When one person is on call for
support, every class of user mistake you can prevent at build
time is a support call you do not have to take at three in the
morning.

Complexity has to hide. Opening the settings page and seeing a
thousand options is not a feature. It is a defeat. Pick sensible
defaults. Let the user override them when they know what they
are doing.

And the thing has to keep working after it ships. The code you
write today, you will still have to maintain years from now,
when the original context has faded, and you are doing this
between a full-time job and a family dinner. Future you has to
understand present you.
