---
title: "The widget that would not stay, and the play command that hijacked televisions"
part: 3
---

# The widget that would not stay, and the play command that hijacked televisions

Once Cast was back in, the twenty fourth of April 2026 turned
into a single long day of handshake bugs. Nine commits. All of
them about the same thing from different angles: the phone and
the television disagreeing about whether a cast session existed.

Before that, one bug from the day before, because it sets up the
whole category.

## A play button that could take over a stranger's evening

The commit is titled "gate remote PLAY to prevent cross-device
player hijacking."

The situation it fixes: somebody is watching something on the
television. Somebody else, on a phone, elsewhere in the house,
presses play in the NoMercy app. The television stops what it is
doing and plays the phone's content.

The cause is that remote control commands were being broadcast
without any concept of a target. A play command meant "play,"
addressed to everything listening, and the television was
listening. There was no notion of this phone having selected this
television.

The fix added a flag called `isLocallyEngaged`, and a log tag,
`REMOTE_HIJACK_DROPPED`, for when a command is refused. If the
television is currently engaged with a local user, it ignores
remote play. That works and it shipped.

The commit's own message says what it actually is:

> Proper receiver pairing: the phone must explicitly pick a TV as
> its target before commands are obeyed. `isLocallyEngaged` is
> the interim barrier.

The interim barrier was never replaced. Proper pairing was never
built in that repository. This is the first of four things that
were still open when the old app was frozen, and it is worth
sitting with, because it is the most ordinary kind of technical
debt there is. The correct design was known, written down, and
never got prioritised over the next fire.

There is a nastier version of this same gap that showed up in
testing much later, with two people involved. A friend testing
the app started a cast from their phone while signed in to a
different user's media server, with a television in the room
connected to a third. Without an explicit pairing step, "cast to
that television" is not a well formed request at all, because the
television and the phone do not necessarily agree about which
library either of them is looking at. Broadcast semantics do not
survive contact with more than one household.

## The widget nobody could keep on screen

Now the twenty fourth. The user visible complaint, quoted
verbatim inside one of that day's commits, is four words long:

> i still don't have my widget

The widget is the phone's cast control. When you are casting to
the television, your phone should show a persistent notification
with the title, the artwork, and transport controls. It kept
disappearing.

The reason is a beautiful little piece of protocol naivety. The
phone watches the television's player state messages. If a
message says the player is at position zero out of duration zero,
that reasonably means nothing is playing, so the phone tears its
cast widget down.

During a cast handshake, the very first player state message the
television sends is always zero out of zero. It has not loaded
anything yet. So the phone would start a cast session and then
immediately destroy its own cast UI, one message later, using
logic that was correct for every case except the one that happens
every single time.

The fix is a one way latch called `hasBeenActive`. A zero out of
zero message is only honoured as a stop if the session has ever
reported real progress. Before that, it means nothing yet, not
nothing at all.

## The four companion bugs

Fixing that immediately exposed the shape of the state machine
around it, and four more commits landed the same day.

The first handled the opposite end. If the television user paused
and walked away, position stayed non zero forever, so the phone's
stop rule never fired and the notification lived permanently. The
fix stops the cast service when the remote item becomes null,
rather than inferring death from position.

The second fixed a regression caused by that. During cast start,
the current item is transiently null, because the television has
disconnected from one thing and not yet attached to the next. The
new rule fired during the gap and tore the notification down mid
handshake. The commit notes the consequence precisely: it left
only Play Services' own copy of the media card on screen. In
other words, the fix for one problem produced exactly the
duplicate card situation that the framework removal in part two
had tried to eliminate, except worse, because now NoMercy's card
was the one that vanished.

The third added a five minute idle auto disconnect. Television
playback events were re-activating the phone's remote control
active flag, so the phone would grow a cast widget for a session
the user had never started in that app run. Somebody watching
television in the living room would find cast controls on their
phone for no reason they could explain.

The remaining four commits that afternoon are notification
layout, artwork, and further hardening in the same cluster.

## Why they all landed on one day

None of these are independent bugs. They are one bug, which is
that there was no explicit session state machine, only a set of
inferences drawn from playback telemetry. Position, duration and
current item are observations about a player. They were being
used as evidence about a session.

Every one of these five fixes is a patch that adds a guard
condition to an inference. The latch, the null check, the
transient null exemption, the idle timer. Each one is correct.
Collectively they are a state machine that was never designed,
assembled by accretion, one incident at a time.

That is the lesson to take out of this part, and it comes back
with much higher stakes in the new app, where the equivalent
problem finally got named and solved with an actual named
lifecycle object instead of a pile of conditions.
