---
title: "Waking the television"
part: 0
---

# Waking the television

Picture this. You are on the sofa with your phone. The television
across the room is off. You open the app, tap the cast button,
pick the living room, and the television turns itself on, wakes
the app, and starts playing the episode you were about to watch.
Nobody touched a remote.

That is one gesture. On the surface it is the least remarkable
feature in any media app, because YouTube has done it since
forever and nobody applauds. Underneath it is four separate
systems agreeing with each other in a specific order, on a device
class where half the usual Android rules do not apply, over a
protocol that was designed for somebody else's playback stack.

NoMercy shipped that gesture. It took two app generations, about
nine months of intermittent work, one crash that killed the
process on a real device, one mechanism that had to be ripped out
entirely, one bug that came back four separate times over two
months before it was properly understood, and one final feature
request that turned out to be architecturally impossible on stock
Android TV hardware and had to be proven so with logcat output
against AOSP source.

Stoney, who owns NoMercy, followed Google's official Cast
documentation first. It did not get him a reliable feature. He
then worked on it with an AI assistant acting as his CTO across
many sessions, and the assistant struggled with it for a long
time too. His own estimate is that roughly four million tokens of
assistant work went into Cast and TV remote control across the
whole effort. That figure is his estimate and we could not
corroborate it from any record available while writing this, so
treat it as a feel for the scale rather than a measurement. The
commit history is the part we can check, and the commit history
is quite bad enough on its own.

## What this report is

This is not a timeline of commits. There is a timeline
underneath it, and dates and hashes appear where they anchor a
claim, but the point of the report is the mechanics. Every hurdle
in here happened because of something specific and knowable about
how Android, Google Cast, and Android TV actually behave, and
most of those things are either undocumented or documented in a
place you would only find after you already knew the answer.

So each part answers the same three questions. What broke. Why
the platform makes it break that way. What the correct shape
looks like once you understand it.

The last part is a practical guide. Stoney asked for it
explicitly: not just the story, but a set of rules a developer
can read beforehand so they do not spend their own nine months
learning the same things. Every rule in that guide is grounded in
one of the incidents described earlier in the report. None of it
is generic Android advice.

## The structural thing that makes this harder than it looks

NoMercy is one app, one Android App Bundle, one release, with two
completely different user interfaces inside it. On a phone you
get the mobile UI. On a television you get the ten-foot leanback
UI, driven by a D-pad, with different navigation, different
layout, and different lifecycle expectations. Which one you get
is decided at runtime.

Most Cast tutorials assume you are the sender. Your app is on a
phone, and it talks to a receiver that somebody else wrote, or
that you wrote separately as a web page. NoMercy is both. The
same bundle is the phone sender and the television receiver, and
which role a given piece of code plays depends on which of the
two UIs the process booted into.

That dual personality is not a footnote. It directly caused at
least four of the hurdles in this report:

- A lifecycle bug that only exists on the television code path,
  which no amount of phone testing would ever surface.
- HDMI-CEC and ARC behaviour, which is a television concern and
  simply does not exist on the sender side.
- Wake logic that has to run on a device that is currently
  asleep, launched by a system component, under Android's
  background activity launch rules.
- Volume ownership, where the same device is sometimes the thing
  making sound and sometimes a remote control for something else
  making sound, and it has to know which.

If your app has this shape, this report is written for you.

## The parts

The first half covers the old app, `nomercy-app-android`, which
is now frozen and retired. Its Cast work was never finished. That
matters, because the most interesting failures are in there, and
because the thing that finally fixed the worst of them in the new
app is a direct answer to a question the old app never managed to
ask correctly.

The second half covers `nomercy-app-kmp`, the current app, where
this was actually solved. The final investigation chapter is
about a wall that could not be got past at all, and about how you
prove that to yourself with evidence instead of giving up on a
hunch.

Nothing here is sanitised. The ANR is in it. The abandoned
mechanism is in it. The bug that took four attempts in one day
and then got deleted is in it, with the reason it had to be
deleted.
