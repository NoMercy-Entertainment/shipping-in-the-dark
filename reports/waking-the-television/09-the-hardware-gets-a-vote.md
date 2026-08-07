---
title: "The hardware gets a vote, and stopping turns out to be hard"
part: 9
---

# The hardware gets a vote, and stopping turns out to be hard

Early August 2026. The feature works. This part is about the
difference between works and is reliable, which turned out to be
another two weeks.

## The wake, understood properly at last

The second of August, a commit titled "Cast Connect is the music
wake, not a nudge alongside it."

Until this point the design was the one that landed back in April
and never got revisited. The Cast session was treated as a nudge
to the panel, something that fired CEC to turn the screen on,
while the real transport for waking the app was a WebSocket
message telling the television app to come to the foreground.

That design does not work, and the reason was found by measuring
the actual living room box rather than by reasoning about it.

The WebSocket wake path ends with the television app starting its
own activity from a socket callback. That is a background
activity launch. Android blocks those. There is an escape hatch,
`SYSTEM_ALERT_WINDOW`, the overlay permission, and the
implementation had been leaning on it.

The measurement: `SYSTEM_ALERT_WINDOW` is not granted on the
living room box and never has been.

So the real wake transport had been architecturally incapable of
working on the actual target hardware for months. Everything that
did work was working because the Cast session, which was supposed
to be the secondary nudge, was quietly doing the whole job.

The comparison that settled it was YouTube Music. It also does
not hold `SYSTEM_ALERT_WINDOW`. It wakes televisions perfectly.
Its only mechanism is a foreground-launched Cast session, which
is exempt from background activity launch restrictions because
the launch is performed by the system, not by the app.

The fix inverts the design. Await the Cast session itself as the
real wake. The WebSocket message is demoted to a refocus follow
up, useful when the app is already up, not load bearing.

Part ten is about why leaning on the overlay permission was a
mistake of a particular recognisable kind.

## Twenty seconds is not long enough

The same day, a second commit: "the wake gets the time the
hardware takes, and the new owner reports in."

The Cast session start timeout was twenty seconds, chosen the way
timeouts usually are, which is by feel. Three cold wakes of a
real Nokia Streaming Box were measured directly: 8.2 seconds,
18.1 seconds, and one that exceeded twenty and timed out in the
middle of a wake that was going to succeed.

Consumer television hardware is slow to cold boot in a way that
phone-shaped intuition does not prepare you for. The panel
negotiates HDMI, the box wakes its Wi-Fi, the app cold starts,
the receiver registers. Eighteen seconds is a normal outcome, not
a pathological one, and a twenty second timeout means the third
of your users with the slowest hardware sees a feature that
mostly does not work.

The same commit fixed a race that has the same flavour. A device
that has just been handed playback only starts reporting its
position once its playback engine ticks, and the engine only
ticks once audio is actually playing. So a television in the
middle of starting up reports nothing at all for its entire
startup window, and the server, which was watching for reports,
read that silence as a dead device.

Both of these are the same lesson. If a value in your code
describes how long real hardware takes to do something, the value
belongs to the hardware and you have to go and ask it.

## Stopping, which is the part everybody skips

Fourth and fifth of August, three commits, all verified live with
a phone against the living room box rather than in a test
harness.

**Stop casting did not stop anything.** The stop handler set the
cast screen closed first. That took the composable out of
composition, which cancelled the coroutine scope created by
`rememberCoroutineScope`, which was the scope the teardown
network call had been launched on. So the network call was
cancelled before it left the device. The television carried on
playing, and the session lingered until the five minute idle
watchdog eventually closed it.

The lesson generalises well beyond Compose. Teardown must not
live on a scope owned by the thing being torn down. The fix moved
it to a manager owned scope that survives the UI's destruction.

**Three co-located bugs in one commit.** An auto attach probe
re-attached 300 milliseconds after an explicit stop, because the
television still answered "playing" while it was in the middle of
tearing its own player down. A stop handed the local title back
to a device that had never started the cast in the first place.
And re-arming the idle watchdog was not counted as an
interaction, so a freshly started cast started life with a
shortchanged timer.

**A television that vanishes takes its remote with it.** Force
close the app on the television, or put it on standby, and the
phone kept showing a full cast remote for a session that no
longer existed. Every failed session poll was swallowed and the
loop simply ran again. Nothing in the system was empowered to
conclude the television was gone. The idle watchdog could not
help either, because a television that is about to vanish reports
playing right up until the moment it goes silent, so by the
watchdog's rule it was healthy.

Fixed with consecutive failure counting. What makes this one
worth calling out is how it was verified. The test was proven red
first, by forcing the "is gone" condition to always be false and
watching the test fail. Then it was verified on hardware: app
force stopped mid playback, remote gone nine seconds later.

That is what a proven fix looks like on this class of bug. A
green test that has never been seen failing proves nothing, and a
green test on its own does not prove anything about a television
in another room.
