---
title: "The permission-shaped smell"
part: 10
---

# The permission-shaped smell

This part is not about a bug. It is about a category of mistake
that runs underneath several of the earlier parts, and it is the
one Stoney wanted called out by name rather than left as texture.
His description of it, when we were deciding what this report
should say:

> the overlay permission, on boot completed and all those stupid
> things that were just bullshit attempts to get round a crappy
> implementation

He is describing his own code. That is worth saying, because the
category is embarrassing in a specific way that makes people
leave it out of writeups.

## What the category is

You want the platform to do something. The platform will not do
it. So you go looking for a permission, a broadcast, a special
access setting, or a system integration that will let you force
it anyway.

Every time that happened in this project, it was a symptom of not
yet understanding the sanctioned mechanism. Not one of those
workarounds survived. Each one was eventually deleted and
replaced by the thing Android actually wanted you to use, which
in every case needed no special permission at all.

There are two confirmed anchor examples here, ten months apart,
which is the depressing part. The lesson was available in January
and had to be learned again in August.

## Anchor one: BOOT_COMPLETED

Early on, the old app had a class called `TvBootReceiver`. A
receiver for the boot completed broadcast, on a television.

Work out what that is for. It is for being told when the device
powers on, so that the app can get itself running early and
therefore be available when somebody wants to cast to it. It is
pre-launching, in case.

That is a workaround for a question that had not been asked yet.
The question is: how does a cast to a sleeping television start
the app? And the answer, which is Cast Connect launching your
Android TV receiver, is a real, documented, supported mechanism
that does the thing on demand instead of speculatively.

`TvBootReceiver` was deleted in the same commit that added the
Cast launch receiver. It did not need a migration or a
transition. Once the real mechanism was in, it was simply
pointless, which is what happens to workarounds when the actual
answer arrives.

A boot receiver is also a bad citizen. It costs every user boot
time and memory for a benefit that only exists in an edge case,
and Android has been steadily restricting exactly this pattern
for years, so a solution built on it is a solution with an expiry
date.

## Anchor two: the overlay permission

The day before that, another commit had improved a foreground
service so it could launch `MainActivity` "reliably" using
`AlarmManager` and overlays.

Unpack the words. The overlay in question is
`SYSTEM_ALERT_WINDOW`, the draw over other apps permission. It is
one of the few remaining ways an app can escape Android's
background activity launch restrictions and put itself on screen
from the background. The `AlarmManager` is there because a
scheduled alarm is another such escape hatch.

So the design is: I need to start my own activity from the
background, Android will not let me, therefore I will acquire a
permission that exempts me from the rule.

Two things about that. First, it is genuinely user hostile. The
overlay permission is a heavyweight, scary sounding grant that a
user has to go into settings and turn on manually, and on an
Android TV box that means navigating a settings screen with a
D-pad to enable something called "display over other apps"
because a media app asked them to.

Second, and this is the part that took until August to find out,
it does not work. The living room box does not have the
permission granted and never has. The entire WebSocket wake path
that depended on it had been architecturally dead on the target
hardware for months, while appearing to function because the Cast
session was doing the real work in parallel.

The commit that finally diagnosed this reached for the correct
comparison. YouTube Music does not hold `SYSTEM_ALERT_WINDOW`
either. It wakes televisions reliably. Its only mechanism is a
foreground-launched Cast session, which is exempt from
background activity launch restrictions because the launch is
performed by the system rather than by the app.

There was a sanctioned, permission-free, first-party-blessed way
to do this the whole time. The workaround was not a shortcut past
a missing capability. It was a detour around a capability that
existed.

## The related pattern: fighting for the foreground

The foreground reclaim chain in part five belongs to this family
too, even though it never requested a permission.

It is the same instinct in a different costume. The system has
put another app on screen. Rather than asking why the system made
that decision, the code tried to override the decision, and when
overriding did not work it tried harder, with more attempts and
stronger APIs, until the escalation crashed the process.

The actual answer was in part seven and it was not a stronger
API. It was a lifecycle callback pair that had been mismatched
all along, plus a missing flag on the sender. Once the system had
a native receiver it could see and permission to prefer it, the
system made the right decision on its own and there was nothing
to fight.

## The nameable rule

If your implementation of wake, launch, or foreground requires
`SYSTEM_ALERT_WINDOW`, a boot receiver, an exact alarm, or any
other special access grant to work reliably, treat that
requirement as a diagnosis rather than a dependency. It is
telling you that you have not found the sanctioned mechanism yet.

Three practical tests you can apply before you write the
workaround:

**Does a first-party app do this without the permission?** If
YouTube, YouTube Music or Netflix does the exact thing you are
trying to do, and the permission list on their store page does
not include what you are about to ask for, then there is a route
you have not found. Go and find it.

**Would you be comfortable explaining the permission prompt to
the user?** "Please allow NoMercy to draw over other apps so that
your television can turn on" is not a sentence anybody should
have to say.

**Is the permission actually granted on your target hardware?**
Check, on the device, with the feature failing in front of you.
This one took ten months to ask, and the answer had been no the
entire time.
