---
title: "Subtitles and keeping streams yours"
part: 7
---

# Subtitles and keeping streams yours

Two topics sit together on this page because they share a
trait. Both look trivial from the outside, and both turn out to
have dragons hiding in the detail.

Subtitles, because every format is a different kind of file and
every output container has different rules about what it will
carry. A subtitle track that plays fine in MKV can disappear
entirely in HLS.

And the optional protection layer on encoded streams, because
"keeping a paid stream paid" sounds simple until you realize
every browser, every phone, and every TV needs a different
story.

Let us walk through both.

## The subtitle problem, told as a story

You have a Blu Ray of a foreign-language film. You rip it to
MKV. The MKV contains PGS subtitles, which is the format Blu
Rays use.

You play the MKV in VLC on your laptop. Subtitles show up. You
play it in Plex on your Apple TV. Subtitles show up. You are
winning.

Then you try to watch the same content through the NoMercy web
player, which uses HLS. No subtitles. They are gone.

Why? Because PGS subtitles are not text. Each subtitle cue is a
tiny image — a screenshot of what the subtitle looks like,
drawn by the studio's subtitle artist with their preferred
font and positioning. PGS is great for Blu Ray because the
studio gets pixel-perfect control.

But HLS playlists cannot carry image subtitles. HLS only wants
text subtitles, in a format called WebVTT. Your PGS subtitles,
having no text content to begin with, need to be converted. And
the only way to convert an image of text to text is to run OCR
on every cue. That is covered earlier, in the content-analysis part.

The rest of this part covers the wiring. How subtitle streams
get routed from source to output based on what the container
can actually hold.

## The routing decision

There are two kinds of source subtitles:

| Category | Formats                                    |
|----------|--------------------------------------------|
| Text     | ASS / SSA, SRT, WebVTT, mov_text           |
| Bitmap   | PGS (Blu Ray), DVD VobSub, DVB             |

And four kinds of output container:

| Container | Accepts natively                 |
|-----------|-----------------------------------|
| MKV       | Anything (text and bitmap)        |
| HLS       | WebVTT only                       |
| MP4       | mov_text (text), WebVTT sidecar   |
| DASH      | WebVTT sidecar                    |

The encoder walks a small decision table:

```
source=text,   output=mkv   → copy
source=text,   output=hls   → extract (WebVTT)
source=text,   output=mp4   → extract (WebVTT sidecar) or convert to mov_text
source=text,   output=dash  → extract (WebVTT sidecar)

source=bitmap, output=mkv   → copy
source=bitmap, output=hls   → OCR → WebVTT, or burn-in
source=bitmap, output=mp4   → OCR → WebVTT sidecar, or burn-in
source=bitmap, output=dash  → OCR → WebVTT sidecar, or burn-in
```

## The three modes you can pick

You can override the routing with an explicit mode on the
subtitle profile:

```json
{
  "subtitle_profiles": [
    { "mode": "extract",  "codec": "webvtt", "languages": ["en"] },
    { "mode": "burn_in",  "codec": "ass",    "languages": ["jp"] },
    { "mode": "passthrough" }
  ]
}
```

**Extract mode** writes WebVTT, SRT, or ASS next to the video,
and references it from the playlist. Good for soft subtitles
the player can toggle.

**Burn-in mode** renders subtitles directly into the video
frames. Permanent. There is no toggle at playback time. Good
when the player cannot render soft subtitles at all, or when
you know the viewer always wants subtitles on (foreign
dialogue only in a mostly-English film, for example).

**Passthrough mode** copies the subtitle stream verbatim into
the container. Only makes sense for MKV and DASH, because
those are the only containers that accept anything.

## Burn-in specifics

Burn-in triggers a video filter chain. ASS burn-in needs
libass, statically linked into NoMercy's ffmpeg build. PGS
burn-in uses the overlay filter on rendered subtitle frames.

The filter chain for ASS:

```
-vf "ass=input.ass"
```

For PGS, it is a two-input graph:

```
-filter_complex "[0:v][0:s:0]overlay=format=auto[out]" -map "[out]"
```

When burn-in is picked, a warning surfaces so users know the
output track has no toggleable subtitles:

```json
{
  "severity": "warning",
  "id": "subtitles.burn_in_permanent",
  "message": "Burn-in is permanent. The output variant has no toggleable subtitles."
}
```

Per variant in an HLS ladder, burn-in applies to every variant
tagged for the same language. Multi-language burn-in would need
separate variant ladders per language, which is expensive.

## The HLS WebVTT pipeline

When extracting for HLS, five things happen.

**1. Read the source subtitle stream.**

**2. Convert text codecs to WebVTT** with a subtitle filter:

```
ffmpeg -i source.mkv -map 0:s:0 -c:s webvtt en.vtt
```

**3. Convert bitmap codecs to WebVTT via OCR** (covered in the
content-analysis part):

```
ffmpeg -i source.mkv -map 0:s:1 -c:s ocr_subtitle -ocr_lang eng en.vtt
```

**4. Slice WebVTT into segments** aligned with the video
segments. The slicer produces a per-segment `.vtt` file plus a
sidecar `subs_en.m3u8`:

```
en/
  subs_en.m3u8
  en_000.vtt
  en_001.vtt
  en_002.vtt
  ...
```

**5. Reference the sidecar playlist from the master** with an
`EXT-X-MEDIA` tag:

```
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS

#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",\
 DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="en",\
 URI="en/subs_en.m3u8"

#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Japanese",\
 DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,LANGUAGE="jp",\
 URI="jp/subs_jp.m3u8"

#EXT-X-STREAM-INF:BANDWIDTH=5000000,AVERAGE-BANDWIDTH=4500000,\
 RESOLUTION=1920x1080,FRAME-RATE=23.976,\
 CODECS="avc1.64002a,mp4a.40.2",\
 VIDEO-RANGE=SDR,\
 SUBTITLES="subs"
v0-1080p/playlist.m3u8
```

The `SUBTITLES="subs"` attribute on each stream-inf line tells
the player to pick up the group by id.

Players that respect Apple's HLS spec (Safari, iOS, tvOS) read
the sidecar and offer subtitle tracks in the UI. Players that
do not (some older web HLS players) need a JavaScript layer to
fetch the WebVTT manually.

## Preserving ASS styling across containers

ASS carries rich typesetting. Positions, colours, fade effects,
font choices, hand-tuned karaoke. WebVTT has a much smaller
subset. A naive HLS pipeline would convert ASS to WebVTT and
drop most of that styling on the floor.

NoMercy does not do that. ASS tracks ship as sidecar files in
every output format — MKV, MP4, HLS, DASH — right next to the
video. The NoMercy web player renders ASS client-side with
[JavascriptSubtitlesOctopus](https://github.com/libass/JavascriptSubtitlesOctopus),
a libass WebAssembly port. Native platforms (Android, TV)
render ASS through their bundled libass equivalent. Karaoke,
positions, fades, all of it comes through faithfully.

For third-party clients that cannot render ASS (stock iOS Safari
HLS, some smart-TV HLS clients), the validator warns so the
operator can ship a WebVTT fallback in parallel if they need it:

```json
{
  "severity": "info",
  "id": "subtitles.ass_needs_capable_client",
  "message": "ASS tracks ship as sidecars. NoMercy's own clients render them via libass; third-party HLS players may fall back to plain text.",
  "fix": "Ship both ASS and WebVTT in the profile if you need third-party HLS client coverage."
}
```

## Attached fonts

MKV sources often ship with attached font files — `.ttf` and
`.otf` — that the original subtitle author used for typesetting.
Renderers need those specific fonts to match the intended look.

The font extractor pulls them out via ffmpeg on every encode
that carries an ASS track, regardless of output container:

```
ffmpeg -dump_attachment:t "" -i source.mkv
```

The extracted fonts land in the output directory alongside the
subtitle files. The NoMercy web player loads them into
SubtitlesOctopus at play time so libass-wasm renders the ASS
with the same fonts the author picked. Native clients do the
same with their platform libass. Without this step, even a
libass-capable client would fall back to system fonts and the
typesetting would drift.

## Chapter writing

Sources with chapter metadata get their chapters preserved in
the output. Chapters come from Blu Ray rips, anime with opening
and ending markers, documentaries with section breaks, and
similar.

For MKV, chapters carry over via stream copy.

For MP4, chapters are written as a chapter reference atom
(`chpl` or `nmhd` depending on the container flavor).

For HLS, chapters are emitted as `EXT-X-DATERANGE` tags in the
media playlist:

```
#EXT-X-DATERANGE:ID="chapter-1",START-DATE="1970-01-01T00:00:00Z",\
 DURATION=312.5,X-CHAPTER-TITLE="Opening"
#EXT-X-DATERANGE:ID="chapter-2",START-DATE="1970-01-01T00:05:12.5Z",\
 DURATION=485.2,X-CHAPTER-TITLE="The Meeting"
```

For DASH, chapters become `<EventStream>` entries in the
manifest.

Chapters are separate from intro and outro markers produced by
audio fingerprinting. Chapters are source metadata, authored by
the content creator. Intro markers are derived by the
fingerprinter at analysis time.

## Keeping a paid stream paid

Now for the second half of the page.

If you are running a free home server for your own library,
you do not need this part. Your streams are yours because they
are on your own hardware, behind your own auth. Nothing on
disk leaves.

But some users want more. A subscription tier for paid
content. A watch party with invited guests only. A small
commercial offering for a creator's own work. In any of these
cases, you want to make it hard for someone to grab the stream
URL and share it.

HLS has a built-in tool for this. AES-128 segment-level
encryption. Each segment in the playlist is encrypted with a
symmetric key. The playlist tells players where to fetch the
key. If the player does not have permission to fetch the key,
the segments are noise.

## How AES-128 HLS works

The DRM configuration on a profile:

```json
{
  "drm": {
    "scheme": "aes-128-hls",
    "key_uri": "https://media.example.com/keys/{job_id}",
    "key_file_path": null,
    "iv_hex": null
  }
}
```

- `scheme`: currently `aes-128-hls` is the only supported value.
- `key_uri`: what ends up in the playlist. The server can gate
  access behind any auth layer.
- `key_file_path`: local path to the 16-byte key file. If null,
  the encoder generates a random key and writes it.
- `iv_hex`: optional initialization vector as hex. If null, the
  encoder generates a random IV per encode.

Six steps run as part of the encode.

**1. Key generation.** Before the encode starts, the DRM
processor generates a random 128-bit key plus IV, or reuses an
existing one:

```
openssl rand 16 > key.bin
openssl rand -hex 16   # → IV
```

**2. Write a key-info file.** ffmpeg's `-hls_key_info_file` flag
takes a small text file with three lines:

```
https://media.example.com/keys/job-abc123
/abs/path/key.bin
b7e151628aed2a6abf7158809cf4f3c7
```

**3. Pass the key-info file to ffmpeg.** The full HLS command
gains one flag:

```
ffmpeg ... \
  -f hls -hls_time 6 -hls_playlist_type vod \
  -hls_key_info_file /tmp/key-info.txt \
  -hls_segment_filename "seg_%05d.ts" \
  playlist.m3u8
```

**4. ffmpeg writes each segment encrypted with AES-128 CBC.**

**5. The playlist gains an EXT-X-KEY tag:**

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="https://media.example.com/keys/job-abc123",\
 IV=0xb7e151628aed2a6abf7158809cf4f3c7
#EXTINF:6.000,
seg_00000.ts
#EXTINF:6.000,
seg_00001.ts
...
#EXT-X-ENDLIST
```

**6. Players fetch the key over HTTPS, ideally with auth,** and
decrypt segments on the fly. The server is responsible for
enforcing access on the `key_uri` endpoint — usually a
bearer-token check tied to the user's subscription or invite.

## What this actually protects against

AES-128 HLS is not full DRM in the Widevine or PlayReady sense.
Let us be precise about what it does.

It protects against direct URL-to-stream scraping. A user who
opens the `.m3u8` URL without passing through the paywall gets
encrypted segments they cannot decode. They cannot pop the URL
into a download tool and get the movie.

**Key delivery is the weak link.** If the `key_uri` is public,
so is the content. The server must gate key delivery behind
auth proportional to the content's sensitivity.

**Segments exist unencrypted on disk during encoding.** The
encryption happens as ffmpeg writes. If your source-side
storage is compromised, the unencrypted source still exists.
AES-128 HLS is a streaming protection, not a storage
protection.

## What this does well

It works everywhere. Safari, Chrome, iOS, Android, most smart
TVs, Apple TV. The entire device ecosystem speaks AES-128 HLS.
There is no license server to operate. There is no integration
with Widevine, PlayReady, or FairPlay. You do not need a
commercial DRM partner. You run your own encoder, you gate
your own key delivery, you are done.

For home, prosumer, and small-paywall use cases, this is
enough.

## CENC and DASH, planned but not shipped

DASH supports a different scheme called Common Encryption, or
CENC. One encrypted stream, separate license servers for
Widevine, PlayReady, and FairPlay. This covers the studio-grade
multi-DRM story.

Shipping CENC means three things:

1. **A packager.** Either `mp4box` (GPAC) or `shaka-packager`
   for segment-level encryption:

   ```
   mp4box -crypt drm.xml -out protected.mpd source.mp4
   ```

2. **License server integration.** Usually a paid service
   (ExpressPlay, Axinom, BuyDRM, etc.). The encoder emits the
   content key and PSSH boxes; the license server issues
   decryption licenses at playback time.

3. **Certificate handling per DRM system.** Widevine requires
   Google-signed certs; PlayReady requires Microsoft-signed
   certs; FairPlay requires Apple-signed certs. Each has its
   own provisioning flow.

CENC is marked on the roadmap as paid-tier work. AES-128 HLS
covers the home and prosumer and casual-paywall case. CENC
covers commercial streaming at scale, which is a smaller user
base and a larger build.

## Subtitle and DRM interaction

The validator enforces a few combinations:

| Container | Mode        | Allowed subtitle codecs           |
|-----------|-------------|------------------------------------|
| MP4       | extract     | WebVTT, SRT, mov_text              |
| HLS       | extract     | WebVTT only (ASS triggers warning) |
| MKV       | any         | All subtitle codecs                |
| DASH      | any         | All subtitle codecs (WebVTT sidecar) |

When DRM is enabled on an HLS encode, subtitle sidecars are
**not encrypted**. Subtitle files are tiny and carry no content
worth stealing. The video segments are where the protection
matters.
