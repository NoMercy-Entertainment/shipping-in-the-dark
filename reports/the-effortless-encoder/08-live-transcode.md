---
title: "Playing what your device cannot decode"
part: 8
---

# Playing what your device cannot decode

You have a 4K Blu Ray rip of a movie. The file on disk is HEVC
with 10-bit colour, 7.1 Atmos audio, and Dolby Vision metadata.
Your main TV at home loves it. It was practically engineered
for it.

Now you are on a bus, on your phone, on mobile data. The
phone's decoder can handle H.264 at 1080p. Your 4K HEVC file
with Dolby Vision might as well be a rock as far as this
phone is concerned.

What do you do?

**Option one.** Re-encode the whole movie once on the server
into a smaller format. Store that output too. Now you have two
files per title. Times every movie in your library. Your disk
usage just doubled.

**Option two.** Make the server re-encode the movie on the
fly, exactly for this phone, exactly right now. When you stop
watching, the server discards the work. Next time you come
back, it does it again, possibly a bit further into the file,
possibly at a different quality because you are on wifi now
instead of mobile.

Option two is live transcode. It is what the encoder does when
the stored file and the client device do not match. And it is
what this page is about.

## When does it kick in

The web player detects client capabilities at session start.
When the source does not match what the client can play, it
asks the server for a live transcode.

```
POST /api/v1/streaming/live/sessions
Content-Type: application/json

{
  "video_file_id": "vf-abc123",
  "client_capabilities": {
    "supported_video_codecs": ["h264", "vp9"],
    "supported_audio_codecs": ["aac", "opus"],
    "max_width": 1920,
    "max_height": 1080,
    "hdr_support": "none",
    "supports_hls_aes128": true
  },
  "start_at_seconds": 0
}
```

The Live Streaming Service creates a Live Session. Response:

```json
{
  "session_id": "lts-7f31b2",
  "playlist_url": "https://server.example/live/lts-7f31b2/playlist.m3u8",
  "selected_variant": {
    "codec": "h264",
    "width": 1920, "height": 1080,
    "bitrate_kbps": 5000
  },
  "expires_at": "2026-04-17T04:42:00Z"
}
```

Three things happen server-side:

1. The `LiveQualitySelector` picks a quality profile matching
   the client's constraints.
2. The `LiveFfmpegRunner` spawns ffmpeg writing HLS segments
   into a session-scoped temp directory.
3. The session ID and playlist URL are returned to the client.

The client hits the playlist URL. The HLS player pulls
segments as they become available. The session ends when the
client disconnects.

## Architecture

```
┌──────────────────────────┐
│   Live Streaming Service │
│   (sessions, lifecycle)  │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│       Live Session       │
│   (state, cancellation)  │
└────────┬─────────────────┘
         │
         ├────────────────┐
         ▼                ▼
┌──────────────┐  ┌───────────────────┐
│ LiveFfmpeg   │  │ LivePlaylist      │
│ Runner       │  │ Builder (segment  │
│ (ffmpeg PID) │  │ events from .m3u8)│
└──────────────┘  └───────────────────┘
```

At the top sits the Live Streaming Service. It creates
sessions, tracks active ones, and cleans up on timeout.

Below that sits the Live Session, which holds session state, a
cancellation token source, and playback position.

Below that, two components work in parallel. The runner spawns
and monitors the ffmpeg process. The playlist builder reads
the `index.m3u8` file and emits segment events.

## What the ffmpeg command looks like

A typical live-transcode command:

```
ffmpeg -ss 0 -i "/library/movies/matrix.mkv" \
  -init_hw_device cuda=gpu0:0 -filter_hw_device gpu0 \
  -hwaccel cuda -hwaccel_output_format cuda \
  -c:v h264_nvenc -preset p4 -rc vbr -b:v 5000k -maxrate 6000k -bufsize 10000k \
  -profile:v high -level 4.2 \
  -pix_fmt yuv420p -g 96 -keyint_min 96 -sc_threshold 0 \
  -c:a aac -b:a 192k -ac 2 -ar 48000 \
  -f hls -hls_time 4 -hls_playlist_type event \
  -hls_segment_type mpegts \
  -hls_segment_filename "/tmp/nomercy-live/lts-7f31b2/seg_%05d.ts" \
  -progress pipe:2 \
  "/tmp/nomercy-live/lts-7f31b2/index.m3u8"
```

Notable details.

`hls_playlist_type event` means the playlist grows as segments
are written, with no rewrites. You get live-style playback
semantics even though the source is a finite file.

`hls_time 4` sets 4-second segments for low latency. Standard
VOD HLS uses 6 seconds. Live transcode trades segment count
for startup time, because the user is waiting for the first
segment to be ready.

`-g 96` is the keyframe interval. At 24 fps, that is exactly 4
seconds — aligned with the segment boundary so every segment
starts on a keyframe.

`-progress pipe:2` gives structured progress output, which the
runner parses to compute percent complete, current fps, and
current encode speed.

## Session lifecycle

Five steps run in sequence.

**1. Create.** Client POSTs to `/sessions`. The server creates
the session, spawns ffmpeg, and returns the session ID.

**2. Active.** Client sends GET requests for the playlist and
for each segment. Each segment becomes available as ffmpeg
writes it. The playlist is served fresh on each request — the
client polls at a rate the player decides.

**3. Position updates (optional).** Client POSTs to
`/sessions/{id}/position` periodically. These report playback
position for pause and resume support:

```
POST /api/v1/streaming/live/sessions/lts-7f31b2/position
{ "position_seconds": 842.5, "is_paused": false }
```

**4. Teardown.** Client DELETEs the session when done:

```
DELETE /api/v1/streaming/live/sessions/lts-7f31b2
```

The server cancels the ffmpeg process and cleans up the temp
directory.

**5. Ended.** The session transitions to Ended. Its row stays
in the sessions table for a short time for dashboard display,
then is purged.

### Cancellation

Client disconnects. Browser tab closes. Player quits. Client
calls DELETE. The `LiveSession.DisposeAsync` method runs. The
runner's cancellation token fires. The ffmpeg process is
killed. The temp directory is deleted.

Ghost sessions — where the client crashed without calling
DELETE — get cleaned up by the Session Manager after an idle
timeout (default five minutes of no playlist or segment
requests).

### Buffer management

The Buffer Manager watches the client's playback position
versus the segments already generated. It emits Buffer Action
events to ffmpeg via SIGSTOP/SIGCONT or via pausing the
ffmpeg stdin pipe.

Thresholds:

| Buffer vs playhead | Action                                      |
|--------------------|----------------------------------------------|
| > 30 seconds ahead | Suspend (pause ffmpeg; save GPU/CPU)        |
| < 15 seconds ahead after suspend | Resume (unpause ffmpeg)       |
| < 5 seconds ahead  | Drop Quality (switch to lower variant)      |
| < 3 seconds ahead  | Emergency Drop Quality (lowest variant)     |

Suspend fires when the user has been pausing to read subtitles
or left the tab in the background. Resume fires when the
buffer drops. Drop Quality fires when the buffer is thin; the
runner switches the variant so segments produce faster.

### Seek handling

HLS segments are sequential. When a client seeks, the current
live session cannot jump ahead — it is either already encoded
past that point, or not yet reached it.

Current behaviour: a seek closes the session and creates a new
one from the seek timestamp. Session creation is fast (ffmpeg
spawn is about a second on a decent box, plus one segment's
worth of encode time before the client can start playing), so
the user experience is a brief pause and then a new stream
continues.

Future work on the roadmap: transparent seek within an
existing session by repositioning the ffmpeg input. Not
shipped yet.

## Concurrent sessions

Each session is an ffmpeg process. GPU encoders have
concurrent-session limits per card, imposed by the hardware
vendor. The encoder detects the cap at runtime from the GPU
driver and refuses new sessions above it:

```json
{
  "error": "gpu_capacity_exhausted",
  "message": "GPU encoder capacity exhausted on gpu0 (NVIDIA RTX 4080). 12 concurrent NVENC sessions running.",
  "suggestion": "Wait for an existing playback to end, or set hardware_preference=force_software to fall back."
}
```

CPU sessions do not have hard limits. The dispatcher just gets
slower as the CPU saturates. If a session starts to lag, the
buffer manager drops quality to keep up.

## Where the live cache lives

Live session output goes into a configurable cache path. The
default lives in the OS temp directory. Each session gets its
own folder, named with the session ID:

```
/tmp/nomercy-live/
  lts-7f31b2/
    index.m3u8
    seg_00000.ts
    seg_00001.ts
    ...
  lts-9a14cc/
    ...
```

On session end, the folder is deleted. On server restart, any
leftover folders get swept. Sessions do not persist across
restarts, so the folders are orphaned.

The cache path is configurable:

```json
{
  "encoder_options": {
    "live_transcode_cache_path": "/mnt/fast-ssd/nomercy-live"
  }
}
```

Put it on a fast SSD. Segments are written and read
aggressively during playback.

## How this differs from file encoding

Live transcode and file encoding share the encoding strategy
and the ffmpeg execution layer. But live differs in three
ways.

**Live has no Finalize stage.** There is no stitching, no
master playlist cleanup. Event playlists are the final form.

**Live has no checkpoints.** Resume is not meaningful for a
session tied to a live client.

**Live skips the full Analyze stage.** The client already
declared what it wants. The planner takes a shortcut and uses
the capabilities block directly instead of doing a full
source analysis.

The live-specific code lives in its own namespace inside the
encoder. It runs in the same server process as file encoding.
Sessions compete for the same GPU and CPU budget. The Session
Manager arbitrates.

## What the next page covers

Live transcode closes the gap between what you stored and what
you are watching on. But what about the input side of the
library? How does a movie get into your library in the first
place?

The next page covers disc ripping.
