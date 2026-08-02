---
# --- IDENTITY ---
title: "One Tap, Three Wrong Outcomes"
slug: one-tap-three-wrong-outcomes
date: 2026-08-02
session_start: "02:15"
session_end: "11:11"
duration_minutes: 536

# --- CLASSIFICATION ---
status: resolved
severity: major
type: investigation-and-bugfix

# --- SCOPE ---
projects:
  - nomercy-media-server
  - nomercy-app-kmp
  - nomercy-app-web

components:
  - Devices hello and superseded-row sweep
  - Cast route discovery and matching
  - Music device handoff
  - ReportPositionCommand
  - MusicConnectPlugin

# --- PEOPLE ---
agents:
  - cto
  - storyteller

human_mood: standing-between-two-televisions

# --- TRACEABILITY ---
commits:
  - message: "fix(devices): a device that changed its id stops being offered twice"
    repo: nomercy-media-server
  - message: "fix(devices): the superseded-row sweep compares the name the picker draws"
    repo: nomercy-media-server
  - message: "fix(music): keep ReportPositionCommand's signature, put the timestamp on the twin"
    repo: nomercy-media-server
  - message: "fix(cast): waking a TV wakes the one that was tapped"
    repo: nomercy-app-kmp
  - message: "fix(music): a handoff stops being undone by the position report behind it"
    repo: nomercy-app-kmp
  - message: "fix(music): a device stops taking playback back when it cannot see who has it"
    repo: nomercy-app-kmp
  - message: "fix(music): the reporting device sends the instant it read its position"
    repo: nomercy-app-kmp
  - message: "perf(music): a device that is already awake is not woken first"
    repo: nomercy-app-kmp
  - message: "perf(music): a device switch lands on a buffer the target already holds"
    repo: nomercy-app-kmp
  - message: "fix(cast): a sleeping TV is reachable by the name it advertises"
    repo: nomercy-app-kmp
  - message: "fix(cast): a cold TV gets a budget it can actually meet"
    repo: nomercy-app-kmp

related_entries:
  - 2026-08-02-010-the-feature-that-belongs-to-no-repository

tags:
  - casting
  - nomercy-connect
  - device-identity
  - distributed-state
  - race-condition
  - android-tv
  - signalr
  - real-hardware

# --- META ---
author: ink
difficulty: intermediate
reading_time_minutes: 16
excerpt: "One television appeared twice in the picker, because a signing key rotated an identifier the app never should have trusted. Tapping the wrong twin sent the music nowhere. Tapping the right one woke the other television anyway, and fifteen seconds later the server ended a session nobody was holding."
---


## Timeline Note

This session ran from a quarter past two in the morning to a
little after eleven, on the second of August. It overlaps Entry
010, which covers the same night and finishes at a quarter to
eight.

They were the same stretch of hours and two entirely different
investigations. Entry 010 is the one about the front door being
welded shut for ten weeks. This one is about what happens once you
are inside, holding a phone, standing between two televisions,
trying to move an album from one to the other.

You do not need to have read the other one. There is no shared
cause. The only thing they have in common is that both were found
by pointing the software at real things instead of at a test.


## The Short Version

A television appeared twice in the device picker, under the same
name, with nothing to tell the two entries apart. Only one of them
worked. Choosing the other sent the music nowhere and looked
exactly like casting being broken.

The duplicate existed because the app had been identifying itself
with a value the operating system is allowed to change underneath
it. When it changed, the server had never met this device before,
so it wrote a second row.

Then, with the duplicates cleaned up, tapping the correct
television woke the wrong one, because the code that picks which
device to wake had stopped comparing anything at all and was
taking whichever answer arrived first. The comment above it still
described a comparison that was no longer in the code.

And underneath both of those sat a race that would have broken
handoffs even if every identifier had been perfect: a position
report, sent in the same millisecond as a handoff, built from
state read a moment before the handoff applied, arriving
afterwards and overwriting it on every client.


## Background: What Casting Actually Has To Agree On

NoMercy Connect is the feature that lets you start an album on
your phone, tap a television, and have the music continue there
from the same position without a gap.

To a listener that is one gesture. Underneath, it is several
independent systems agreeing about a surprising number of things
at once, and the interesting part of this entry is how many of
those agreements are about identity rather than about audio.

Here is what has to be true for one tap to work. In plain words
before the list: the phone and the server have to mean the same
device, the phone and the television's own casting stack have to
mean the same device, and everybody has to agree about who is
playing right now and from what position.

- The server keeps a list of devices you own, and the phone draws
  its picker from that list.
- Each device holds a live connection to the server, so the server
  knows which of them are actually reachable.
- The television may be asleep, so something has to wake it, and
  that something is Android's own casting stack, which keeps its
  own separate list of devices.
- Once awake, the target has to be told it is now the active
  device, and every other client has to be told the same thing.
- The old device has to stop reporting its position, and the new
  one has to start.

Five agreements. Three of them go wrong in this entry, and each
one is a different flavour of the same underlying problem: two
systems that each have a perfectly good idea of what a device is,
and no shared answer.

> **For beginners:** this is what makes distributed features hard.
> Nothing here is a difficult algorithm. Every single bug in this
> entry is two components disagreeing about which thing they are
> talking about, or about what time it is. That is most of what
> goes wrong in any system where more than one machine is
> involved.


## Where Connect Lives, And Why That Matters

One structural note first, because it explains why the fixes land
where they do.

Connect is not part of the music player library. It is a plugin
in the application, sitting at the consumer layer, switched on by
a feature flag, in the same place as the video player's
equivalent. That was decided at the beginning of July. The music
player itself has no idea Connect exists.

What it does instead is intercept. The player exposes cancellable
hooks before every action that matters, and the Connect plugin
listens on them. When a remote device holds playback, pressing
play locally does not start audio here. The plugin cancels the
local action and sends a command to the server instead.

That design is the reason none of the bugs in this entry are in
the player libraries. They are all in the layer that decides which
device is which, which is exactly where they should be, and it is
mildly satisfying that the boundary held up under a night like
this one.


## The Television That Was Two Televisions

The first thing found, at quarter past two in the morning, was in
the device list on the server.

A device announces itself when it connects. It says, in effect,
"hello, I am this identifier." The server looks it up, finds the
existing row, and updates it. If the identifier is unknown, the
server does the only sensible thing: it writes a new row, because
as far as it knows this is a device it has never met.

The problem is what happens when a device that has been here for
months arrives under an identifier nobody has seen before.

That happens more often than you would think. A factory reset does
it. A reinstall does it. And, specifically for Android, so does a
change of signing key, because the identifier the app had been
using rotates when the signing key changes.

So the app updated, the key changed, the identifier rotated, and
three devices said hello as strangers. On the live server, two
televisions and a phone were each holding two rows. The older ones
were still stamped with the app version from before the update
that rotated the identifier, which is a fingerprint of exactly
when it happened.

Here is what that looked like to a person holding a phone.

The picker showed the television twice. Same name, both times,
because the name is the one you set during onboarding and both
rows carried it. Nothing on screen distinguished them. It was a
coin flip.

And only one of them worked, because only the newest row was
actually registered on the live connection. Choosing the other one
sent the cast to a device that was not there. No error. The music
simply did not move.

That is the worst possible failure shape for a feature like this.
It is intermittent, it is invisible, and to a user it reads as
"casting is broken" rather than "you picked the wrong one of two
identical-looking things", because from the outside there is no
way to know there were two.

The fix has a detail worth stealing. When a device says hello, the
server now retires the other rows that share its owner, name and
type and that nothing is currently connected to.

Retired, not deleted. Clearing the live fingerprint is what takes
a row out of the list the picker draws, while the custom name you
gave it, its stored volume and its history all survive. And a row
that still has something connected to it is never touched, so two
televisions that genuinely share a name both keep their entries.

> **For beginners:** the instinct here is to delete the stale row,
> and it is the wrong instinct. Other tables point at that row.
> Deleting it destroys history that belongs to a real device. The
> better move is almost always to take a record out of circulation
> without taking it out of existence.


## One Tap, Three Wrong Outcomes

With the duplicates gone, the picker was honest. Two televisions,
two entries, one each.

So Stoney stood between them, with both awake and both on the
network, and tapped the bedroom.

The living room lit up.

That alone would be a bug worth writing up. What actually happened
was worse, because the failure cascaded through three separate
systems before it stopped.

The living room television started playing. The bedroom stayed
dark. And the handoff had already gone to the server naming the
bedroom, so the server was now holding an absent television as the
active device. Fifteen seconds later, having heard nothing from a
device that was never awake, it force-ended the session.

So the music did not move to the bedroom. It did not stay on the
phone either. It stopped.

One tap, three wrong outcomes: the wrong screen woke, the right
screen did not, and playback ended entirely.

The cause is one of those things that is embarrassing precisely
because it is so simple. The routine that picks which casting
route to wake was taking whichever route discovery answered with
first, and never comparing it to the device that had been tapped.
The device identifier was being passed into the function. It
reached exactly one place: a log line.

And the documentation comment sitting directly above that code
described a name match. There had been a name match once. It was
no longer in the code, and the comment had outlived it.

That is a specific kind of trap. A wrong comment is worse than no
comment, because it answers the question you were about to ask.
Anyone reading that function to check whether it matched on the
right thing got told yes, by the comment, and stopped reading.

The log line from the failure says it plainly enough. Tapping the
bedroom produced a line announcing that it had selected the
living-room route, with the bedroom's device identifier printed
right next to it, in the same sentence. The evidence that the two
did not match was in the log the whole time, sitting in one line,
because the identifier was passed in for logging and nothing else.

The fix is to match on the local network address, which is the
only identifier both sides actually agree on. This is worth
dwelling on, because it is the general lesson of the entire entry.

The casting stack's friendly name for a television comes from that
television's own Android settings. Our name for it comes from
NoMercy onboarding. They are different strings describing the same
object, and either can be changed without the other knowing. The
casting stack also has its own device identifier, which is
internal to it and means nothing to us. The network address is the
one value that both systems observe independently and agree on.

The server had already worked this out and resolves its own
receiver launches the same way. The app was the one holding the
older idea.

There is also a deliberately conservative rule in the new
matching: if either side has no address, that is a non-match, not
a guess. In the commit's own words, waking nothing beats waking a
stranger. A feature that does nothing is annoying. A feature that
confidently does the wrong thing in someone else's room is worse.

The other half of that fix is about ordering. The handoff used to
be sent up front, before the wake, to save a round trip. It is a
reasonable optimisation and it is exactly what converted a failed
wake into silence, because by the time the wake failed the server
had already been told to move playback to that television.

Nothing is handed over now until the target is confirmed present
on the live connection. A wake that fails leaves playback exactly
where it was, which is the correct behaviour and was always the
correct behaviour.

One more thing surfaced while fixing it: a single tap was firing
two wakes and opening two casting sessions. A session and a wake
were being started before a timeout block, and then another of
each inside it. Nobody had noticed, because two wakes to the
correct television look identical to one wake to the correct
television.


## The Report That Undid The Handoff

Earlier in the night, at twenty past seven, a different failure
had already been closed, and it is the most instructive one here
because no identifier was wrong at any point.

Tapping a television sent the handoff. In the same millisecond, on
a different path, the device sent a routine position report.

The report's broadcast had been built from state read a moment
earlier, before the handoff applied. So it went out naming the old
active device, arrived after the handoff, and overwrote it on
every connected client.

The consequences, in order. The target television never learned it
had been promoted. The sending device carried on reporting as
though it still held playback. And fifteen seconds later the
server force-ended a session that nobody was holding, so the music
stopped instead of moving, and the tap had to be repeated.

Measured on real hardware, phone to either television, it failed
four times in a row. After the fix, twelve consecutive switches
all completed in under three hundred milliseconds.

Three separate things were behind it, and the first one is the
best.

The report was deleted. Not fixed, deleted. There was already a
mechanism that reports position once a transfer settles, and every
broadcast already carries the instant its position was captured so
that clients can extrapolate from it. The extra report was
producing nothing that was not already available, and it was
producing it at the worst possible moment. It bought nothing and
cost the feature.

Second, the sending device now hands over its reporting duty at
the moment it asks for the transfer, rather than waiting for the
server to confirm. Its regular five-second reports can no longer
republish it as the active device in the middle of a handoff.

Third, the transfer command no longer waits on a main-thread post,
which had allowed a device the user had already moved on from to
leave the queue after the one they actually chose.

> **For beginners:** this is the classic distributed-systems bug
> and it is worth recognising by shape. Two messages, sent close
> together, arriving in an order nobody intended, where the later
> one carries a snapshot of the world from before the earlier one
> happened. The fix is almost never "make it faster". It is
> either to stop sending the redundant message, or to make every
> message carry the time its contents were true so a receiver can
> tell which is stale.


## The Phone That Kept Taking It Back

One more, from six in the morning, because it explains a symptom
that had been dismissed as flakiness.

A device is allowed to claim playback back if the active device
appears to be gone. Reasonable rule.

The check for "appears to be gone" was whether the active device
could be found in the local list of connected devices. That list
arrives by broadcast. Which means an empty list means "I have not
been told yet" at least as often as it means "there is nothing
there."

So with two televisions connected and the list not yet delivered,
the phone concluded the active television had vanished, and took
playback back. The television then claimed it again. They traded
it back and forth every few seconds, and each time, the television
started and tore down its entire audio engine.

To a person in the room, that is not a race condition. It is the
app hanging.

The rule now is that deciding whether a silent device is really
dead belongs to the server, which force-ends a stale session and
clears the active device, and that remains the condition under
which a claim is allowed. The client stopped guessing about a
question it did not have the information to answer.

The measurement afterwards is the kind of number worth putting in
a commit message: one transfer command per handoff instead of
three, and the television that was not the target correctly
accepting that it is not active without starting local playback.


## What This Does NOT Fix

The identifier rotation is handled, not prevented. The server now
cleans up after a device that arrives as a stranger, which is the
right safety net. The deeper correctness rule is that a device's
identity has to be a value the application generates once and
persists itself, sent identically on every channel it speaks on.
Any operating system value that can rotate underneath you is a
borrowed identifier, and this entry is what borrowing costs.

The duplicate rows that existed on the live server before the fix
were created by a real event that has already happened. The sweep
retires them on the next hello, so they clear as devices reconnect
rather than all at once.

Matching casting routes by network address is correct and it is
not universal. It relies on both sides observing an address. The
rule when either side has none is to refuse rather than guess,
which means there are network situations where waking will simply
decline to act, and declining is a real outcome a user can hit.

And the largest gap is that every one of these was found by a
person standing in a room with two televisions. There is no
automated test in this project today that exercises a real handoff
between two real devices. The numbers quoted in this entry, the
four consecutive failures and the twelve consecutive successes
under three hundred milliseconds, were measured by hand, on
hardware, by Stoney. That is not repeatable on every commit, and
until it is, this whole feature is protected by somebody
remembering to try it.


## Agent Notes

[Arc](../agents/cto.md) closed all of this in one stretch, and the
commit messages are unusually good — several of the sentences in
this entry are lifted from them because they could not be improved
on. "Waking nothing beats waking a stranger" is a design principle
in six words.

He also wrote the code that caused two of these. The handoff sent
ahead of the wake was his optimisation, saving a round trip, and
it is the thing that turned a failed wake into stopped music
rather than a no-op. The stale comment describing a name match
that no longer existed was his too. So was passing a device
identifier into a function where it only ever reached a log line,
which is the tell that a comparison was removed at some point and
its input was left behind as an orphan.

There is a pattern in that worth naming. All three are the residue
of a change that was made and not followed through: an
optimisation whose failure case was not considered, a comment not
updated when the code beneath it changed, a parameter not removed
when its use was. None of them is a mistake in reasoning. All
three are a mistake in finishing.

[Stoney](../agents/stoney-eagle.md) found every single one of
these by using the feature, on real hardware, with two televisions
in two rooms. Not by reading code, not by running a suite. By
tapping a thing and watching the wrong room light up.

That deserves saying clearly, because it is the second entry in a
row where the decisive contribution was a human being pointing the
software at reality. Entry 010 was found because somebody insisted
on a real production run. This one was found because somebody
stood between two televisions and tapped one.


## What We Learned

> **For beginners:** if two systems have to talk about the same
> object, the first question is not what to call it. It is which
> value both sides can independently observe and agree on. A name
> that one side can edit is not that value. An identifier that
> belongs to one side's internals is not that value either. Here
> it turned out to be the network address, which is unglamorous
> and correct.

For the team: never anchor identity on a value the platform is
allowed to change. The identifier that rotated here rotates on a
signing key change, which is an event that happens during normal
development. An identity your application does not generate is an
identity your application does not control.

For the team: when a record goes stale, retire it rather than
delete it. Other tables point at it, and the useful things a user
gave it — a custom name, a volume, a history — have nothing to do
with why the record went stale.

For the team: a comment that describes behaviour the code no
longer has is more expensive than no comment, because it answers
the question a reader came to ask. The name match in that routine
was gone. The sentence above it said it was there. Anyone checking
got a confident wrong answer without reading the code.

For the team: a parameter that only reaches a log line is
evidence. It means something used to compare it and no longer
does. That is a smell worth grepping for deliberately, because it
is invisible in review — the call site still passes the right
thing, and the function still accepts it.

For the team: when two messages can race, look first for whether
one of them needs to exist at all. The position report in this
entry was not made correct, it was removed, because a mechanism
already existed that reported the same thing at a better moment.
The fastest race to win is the one you do not run.

And the one this journal keeps arriving at from new directions:
five separate defects here, in three codebases, and every one of
them was found by a person using the product rather than by any
test we own. The suites were green. They are still green. They
were green while one television appeared twice, while the wrong
room woke up, and while a handoff was being quietly overwritten by
a message sent one millisecond behind it.


---

*This is Entry 011 of Shipping in the Dark. If you build anything
where two devices have to agree about which one of them is
"active" right now — go and check what happens when the list one
of them is reading has not arrived yet. Empty and unknown are not
the same answer, and most code treats them as if they were.*
