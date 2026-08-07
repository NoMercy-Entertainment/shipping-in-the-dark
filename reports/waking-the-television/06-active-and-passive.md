---
title: "Active and passive, or why a silent player is still a player"
part: 6
---

# Active and passive, or why a silent player is still a player

The same day as the ANR, a different subsystem got rewritten from
its foundation. This part is about multi device music rather than
Cast, and it belongs in this report for two reasons. It shares
the hardware wake path with Cast, so its bugs and Cast's bugs
kept arriving together. And it is where the volume ownership rule
was learned, which is the rule the final chapter of this report
runs into a wall over.

## The design that was wrong

NoMercy Connect lets several devices participate in one music
session. One of them is producing sound. The others are
participating: showing what is playing, offering transport
controls, ready to take over.

The original implementation made every participating device run a
full ExoPlayer instance. The ones that were not producing sound
ran theirs muted, mirroring the playback locally so that their UI
had something real to read from.

Read that again, because the flaw is right there. Every passive
device is running an independent playback engine, advancing
independently, making its own decisions about when a track ends
and what comes next. Meanwhile the server has its own
auto-advance logic for the session as a whole.

The rewrite commit names the symptoms: ten second skip cycles
after device switches, and multi session media echoes. Those come
from two or three engines all reaching the end of a track at
slightly different moments and all announcing a track change.

The rewrite, in the commit's own framing, is Spotify's model.
Passive devices have no running audio engine at all. Only the
active device runs an engine. Everything else is a view onto
state it receives.

## The five bugs that fell out of the rewrite

Removing the passive engine removed things nobody had noticed
were depending on it.

The progress bar stopped scrolling and started
jumping. The engine's time updates had been driving the UI
ticker on passive devices. With no engine, the only position
information is whatever the server sends, which arrives every few
seconds. Fixed with a wall clock interpolator that advances the
displayed position locally between updates.

Tapping play on a passive phone called the local
`play()` before the server's mute broadcast arrived. For a window
of a few hundred milliseconds, the phone in your hand audibly
took over playback from the television, then went quiet again.

ExoPlayer starts at its last remembered volume, which might be
loud, before the desired volume and mute state get applied. The
commit calls it a brief loud burst on every play, which is an
accurate and unpleasant description.

Then two things in one commit. Activation started playback from position
zero and then seeked, so you heard a fraction of a second of the
start of the track before it jumped to where the session actually
was. Fixed by setting the start offset before `prepare()` rather
than seeking after.

The second half of that commit is a platform fact worth writing
on a wall. The device picker was gating its Cast wake on
`screen_on` and `PowerManager.isInteractive`. That check, in the
commit's words, lies on Android TV boxes.

`isInteractive` is documented as reporting whether the device is
in an interactive state, and on a phone it does that. On a
television box, the device class has no consistent notion of what
interactive means. The box may be fully powered with the panel
off. The panel may be on with the box in a low power state. The
HDMI sink may be off while the source is awake. Reading
`isInteractive` on that hardware gives you an answer that is
confidently wrong often enough to break the feature and rarely
enough that you will not reproduce it on your desk.

The fix is not to read a better API. There is not one. The fix is
to stop asking and just attempt the wake, because attempting a
wake on an already awake device is harmless and skipping a wake
on a sleeping one is the whole bug.

And a same day regression from the rewrite: stop events
were clearing `current_device_id`, which lost the session's
notion of who was active.

## The volume rule

There is a separate thread from three weeks earlier, the twenty
fifth of April, that introduced
`VolumeProviderCompat` in remote mode so that a `MediaSession`
could carry remote volume commands. It shipped with two
protections that only exist because feedback loops were actually
observed.

An input origin lock, distinguishing local from remote with a
three second ownership window, so that a CEC echo cannot clobber
a volume the user just set with their finger. And a
`ContentObserver` self write echo suppressor with a 1.5 second
window, so that the app's own write to the system volume does not
come back through the observer and get treated as a user action.

Both of those are the same underlying situation. When two systems
can both set volume, and both observe volume, and neither
distinguishes its own writes from the other's, you get a loop.
The volume walks up or down on its own, or snaps back
immediately after you set it.

The rule that all of this adds up to is short. **A passive device
must never assume it owns the volume channel.** Whether the input
arrives from a hardware button, a Bluetooth headset, or, as part
twelve will show, a television remote over HDMI-ARC, the question
"who should this volume change apply to" has an answer that is
not always "me."

That rule was learned here in April and May, applied again in the
new app in July, and applied a third time in August against a
completely new physical input. Each time it had to be
rediscovered for the new input, because the input arrives through
a different Android API and nothing connects them.

## What was left open

The rewrite commit names a phase two: collapsing the codepath that
applies server state to a local engine, for passive listeners
that no longer have one. It never landed. Fourth and last of the
things unfinished when the old app was frozen.

Shortly after this, development moved to `nomercy-app-kmp`.
