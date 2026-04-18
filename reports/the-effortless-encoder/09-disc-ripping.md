---
title: "From shelf to library"
part: 9
---

# From shelf to library

You have a shelf of Blu Rays. Real physical discs. You bought
them over the years, and they have survived every round of
home-theatre rearrangement. Most are still in their cases.
Some are loose in a drawer.

You want them in your media library.

That means, for each disc, ripping it to a file on your
server. Then optionally re-encoding that file into formats your
players can use. Then enriching it with metadata like cover
art and cast info.

All of that has to happen with as little manual work as
possible. Ideally you put the disc in the drive, walk away,
come back later, and the movie is in your library the way it
should be.

This page covers the first half of that — disc ripping. The
rest, the re-encoding, is what the other pages have been
describing.

## Watching for discs

The first piece of the system is the Drive Monitor. It polls
the operating system's list of optical drives every few
seconds, and emits events:

```csharp
public interface IDriveMonitor {
    IAsyncEnumerable<DriveEvent> MonitorAsync(CancellationToken ct);
}

public record DriveEvent(
    DriveEventType Type,          // Added, Removed, Inserted, Ejected
    string DriveLetter,           // "D:\" on Windows, "/dev/sr0" on Linux
    string? VolumeLabel           // Null if no disc present
);
```

The four event types:

- `DriveAdded` — a new optical drive appears. A USB Blu Ray
  drive was just plugged in.
- `DriveRemoved` — a drive goes away.
- `DiscInserted` — a drive that was empty now has media.
- `DiscEjected` — a drive that had media is now empty.

The monitor is cross-platform. It uses .NET's `DriveInfo`,
filtered to `DriveType.CDRom`. That works on Windows, Linux,
and macOS without platform-specific code.

A single SignalR push to connected dashboards:

```json
{
  "hub": "drives",
  "event": "disc_inserted",
  "drive": "D:\\",
  "volume_label": "BLACK_PANTHER_2022",
  "timestamp": "2026-04-17T03:21:04Z"
}
```

## Reading what is on the disc

When a disc is inserted, the Disc Scanner reads the title
structure via ffprobe. Specifically, it uses ffprobe's
`bluray:` and `dvdread:` pseudo URLs:

```
ffprobe -v quiet -print_format json \
        -show_format -show_streams -show_programs \
        "bluray:D:\\"
```

For a Blu Ray, that returns a program per title. A typical
scan result:

```json
{
  "mount_point": "D:\\",
  "disc_type": "bluray",
  "volume_label": "BLACK_PANTHER_2022",
  "titles": [
    {
      "index": 0,
      "duration_seconds": 8220.45,
      "chapter_count": 31,
      "video_streams": [
        { "codec": "hevc", "width": 3840, "height": 2160, "bit_depth": 10, "is_hdr": true, "dolby_vision": true }
      ],
      "audio_streams": [
        { "codec": "truehd", "channels": 8, "language": "eng" },
        { "codec": "ac3",    "channels": 6, "language": "eng" },
        { "codec": "ac3",    "channels": 6, "language": "fre" }
      ],
      "subtitle_streams": [
        { "codec": "hdmv_pgs_subtitle", "language": "eng", "forced": false },
        { "codec": "hdmv_pgs_subtitle", "language": "eng", "forced": true  },
        { "codec": "hdmv_pgs_subtitle", "language": "fre", "forced": false }
      ]
    },
    { "index": 1, "duration_seconds": 180.02, "chapter_count": 1, "video_streams": [...] },
    { "index": 2, "duration_seconds": 28.50,  "chapter_count": 1, "video_streams": [...] }
  ]
}
```

Discs typically have a main feature — the longest title,
usually one to three hours — plus short titles for menus,
trailers, and extras. The scanner lists everything. The user
picks what to rip.

## The ripper

The Disc Ripper wraps ffmpeg with disc-specific arguments. For
a Blu Ray, the command looks like:

```
ffmpeg -analyzeduration 100M -probesize 100M \
  -playlist 0 \
  -i "bluray:D:\\" \
  -map 0:v:0 -map 0:a:0 -map 0:a:1 \
  -map 0:s:0 -map 0:s:1 -map 0:s:2 \
  -c copy -copyts \
  "/rips/incoming/title_00.mkv"
```

Key details.

`-playlist N` selects the Blu Ray playlist — the title index.
Different titles use different playlists.

`-c copy` means stream copy, no re-encoding. The intermediate
MKV contains the exact source bitstream, bit for bit. Ripping
is a lossless operation.

The `-map` selections let the user opt in or out of specific
audio and subtitle streams. The default is all streams. The
user can narrow via the dashboard before starting the rip —
you do not usually need seventeen different language dubs in
your library.

`-copyts` preserves timestamps. That matters for chapters and
subtitles staying in sync.

The output filename pattern is simple: one MKV per selected
title, named by title index. The regular file encoder picks
these up automatically if the output directory is a watched
folder with an assigned encoder profile.

## Rip then encode

The full flow has five steps.

**1. Insert disc.** The Drive Monitor fires a `DiscInserted`
event. The dashboard shows a notification.

**2. Scan.** The dashboard shows the disc titles. The user
picks the main feature plus optional extras, and chooses which
audio and subtitle tracks to keep.

**3. Rip.** The Disc Ripper stream-copies to intermediate
MKVs. Duration is roughly the playback length of the disc. Blu
Ray read speed is the bottleneck, not CPU.

**4. Auto-encode.** The `AutoEncodeSubscriber` watches the rip
output directory. When a new MKV lands, it dispatches an
encoding job with the profile assigned to that folder.

**5. Content analysis.** Post-encode subscribers run crop
detection, intro and outro fingerprinting, OCR on bitmap subs,
and so on.

Total time on a typical feature film depends almost entirely
on the drive. The rip takes roughly thirty to sixty minutes,
driven by Blu Ray read speed. The encode with hardware
acceleration typically takes less time per variant than the
rip itself. Analysis is minutes.

## Metadata, still unfinished

The ripper does not yet resolve metadata — movie title,
director, year, cover art, cast. That is a separate resolver
interface, currently scaffolded but not implemented:

```csharp
public interface IDiscMetadataResolver {
    Task<DiscMetadataSuggestion?> ResolveAsync(
        DiscInfo info,
        CancellationToken ct);
}

public record DiscMetadataSuggestion(
    string SuggestedFolder,        // "/library/Movies/Black Panther (2022)"
    string Title,
    int Year,
    string? TmdbId,
    string? ImdbId,
    double ConfidenceScore
);
```

The ripped MKVs land in a folder keyed by disc type plus scan
timestamp. For now, the user moves and renames post-rip based
on what the file actually is.

Future work on the roadmap: auto-query TMDB using the main
title's duration plus any disc-embedded metadata. The system
would suggest a folder structure. The user would confirm
before moving.

This is a known rough edge. It is on the list.

## Supported media

**Blu Ray** is supported via libbluray. Region-free discs work
out of the box. Region-locked Blu Rays need an appropriate
drive firmware — that is not a software concern.

**DVD** is supported via libdvdread. Both CSS-encrypted and
unencrypted discs work, provided the drive can decrypt them.

**HD DVD** is technically supported via generic ffmpeg input.
Not explicitly tested. The format is dead enough that we do
not guarantee it.

**AVCHD** camcorder discs work via the Blu Ray scanner,
because AVCHD uses the same file structure.

**Data discs** with loose video files are not handled by the
ripper. They are treated as a regular filesystem mount — drop
the files in a library folder, and the regular scanner picks
them up.

## The hard honest limits

**AACS and BD+** protected discs require a compatible drive
plus key management, which is outside the scope of this
encoder. The ripper reads the decrypted stream once the drive
has decrypted it. It does not do key retrieval itself. If your
drive will not play a disc, the ripper will not rip it.

**No transcoding at rip time.** This is deliberate. Stream
copy is lossless and reversible. The re-encode happens later,
against the ripped MKV, with whatever profile the user picked.
Want to change your encoding strategy later? You still have
the lossless source.

**One rip at a time per drive.** Optical drives cannot read
two titles in parallel. Multiple drives on the same host can
rip concurrently.

**No drive-specific tuning.** Read speed is whatever the drive
defaults to. Some drives rip faster than others. Not much the
encoder can do about that.

## Security

The ripper runs with mounted filesystem access. On Linux it
does not need elevated privileges, as long as the user is in
the `cdrom` group.

Output paths are checked against the path allowlist. The
ripper cannot write outside configured output directories,
even if someone manages to feed it a malicious filename.

Disc content is not trusted input the way random network
media is. But the scanner still runs in a restricted ffprobe
invocation, with no filter-chain evaluation, because disc
structures have historically contained a surprising amount of
creative malformation.
