---
title: "The first attempts, and the day Cast was removed and put back"
part: 2
---

# The first attempts, and the day Cast was removed and put back

The old app, `nomercy-app-android`, is frozen now. Development
moved to the Kotlin Multiplatform app. Its Cast work was never
finished, and knowing that up front makes it easier to read
honestly, because several of the things in this part are wrong
turns that were correctly abandoned.

## Attempt zero: the scaffolding that never ran

The first Cast code in the repository was deleted before it did
anything. At the start of November 2025, a single commit removed
eight classes in one go: a controller facade, a message type, a
no-op implementation, a receiver, a receiver facade, a role enum,
a session type, and a signalling client. The commit message is
unusually candid about why. They were placeholders and they were
not implemented.

This is worth mentioning rather than skipping, because it is a
recognisable pattern. Somebody sat down, designed a Cast
abstraction from the shape of the documentation, wrote the
interfaces, and then discovered on contact with the actual SDK
that the abstraction did not describe anything real. The right
move at that point is to delete it, which is what happened. The
wrong move, which is more common, is to keep it and start bending
reality to fit.

## Attempt one: the documented path

Three weeks later the real work started. In late November the
Play Services Cast dependency went in, and the day after, Cast
was wired into the video player service with a Cast application
ID. On New Year's Eve a commit titled "Native casting!" added the
Media3 Cast extension and connected a `MediaSession` into the
video player and its service.

That is the documented path, followed faithfully. Media3 has an
official Cast extension. It gives you a `CastPlayer` that
implements the same `Player` interface as ExoPlayer, so in
principle you swap one for the other and casting works. On paper
this is elegant.

In practice it means Cast is loading and owning your media, which
is exactly the thing NoMercy would later forbid outright. The
elegance is real and it is the elegance of somebody else's
playback model. Every piece of NoMercy specific behaviour, the
server side playlist, the subtitle handling, the Connect device
registry, sits outside that interface and has to be mirrored
across it.

## Attempt two: the receiver side

The first week of January 2026 is when the shape of the problem
changes. A commit integrated Cast on the television side: a Cast
launch receiver, a media load handler and its callback, a Cast
media session service. In the same commit, a boot receiver called
`TvBootReceiver` was deleted as no longer needed.

That deletion is the first architectural swap in the story and it
is a good one. The old idea was to hook the device booting. The
new idea was to let Cast launch the app. Part ten of this report
is about why the old idea was there at all and why reaching for
it is a warning sign, so it gets proper treatment there rather
than a paragraph here.

The day before, another commit had made a service called
`LocalReceiverForegroundService` launch `MainActivity`
"reliably" using `AlarmManager` and overlays. The word reliably
in a commit message, applied to starting your own activity, is a
distress signal. Starting an activity is not supposed to need
reliability engineering. That one also belongs to part ten.

## The removal, and the revert the same day

The most instructive day in the old app is the twenty fourth of
April 2026, and it opens with a commit titled "drop Google Cast
receiver framework."

Here is what had gone wrong. Google Play Services, on its own
initiative, was creating a system level media control card on the
phone. It carries the identifier `cast_rcn_media_session`. Every
time the television played anything, the phone's notification
shade grew a media card that Play Services owned, sitting next to
and competing with the media card NoMercy's own playback service
had put there. Two controls for the same playback, one of them
not written by NoMercy, neither of them aware of the other.

That is not a bug in NoMercy's code. It is Cast doing what Cast
is designed to do. If you register as a Cast receiver, the
framework assumes it is the authority on what is playing, and it
surfaces that authority in the system UI.

So the framework came out. The commit is explicit that this was a
tradeoff knowingly accepted: with Cast gone, external senders
like Chrome's cast button or the YouTube app could no longer
target the NoMercy television app as a receiver at all. That
capability was traded away to stop the duplicate card.

Later the same day, it was reverted. Cast came back.

The reason it came back is the reason part one already gave. The
Cast route selection path is the only route a third party app has
to HDMI-CEC One Touch Play. Without Cast, you cannot wake a
television that is off. The duplicate media card was ugly. A cast
button that cannot turn the television on is not a feature at
all. So the ugly thing was reinstated and the fight moved to
managing its side effects rather than avoiding them.

Everything in the next three parts is that fight.

## Running in parallel: the auth handoff

While the Cast work was going on, a second thread was running:
handing authentication from the phone to the television. Over two
days in mid April, six commits built a WebSocket plus Keycloak
device flow handoff, in a sequence that reads as one
implementation followed by several rounds titled along the lines
of polish and fixing the remaining gaps.

It is included here not because it is dramatic but because it is
the honest texture of this work. Almost nothing in this report
landed correct on the first commit. The features that look clean
in the final codebase got there through four or five passes, and
the passes are in the history.
