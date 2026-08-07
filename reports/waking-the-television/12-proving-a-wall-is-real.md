---
title: "Proving a wall is real"
part: 12
---

# Proving a wall is real

Every hurdle in this report so far was solvable. Some took four
attempts and one took a crash and a deletion, but they all had an
answer at the end.

This last one does not. It is here because how you establish that
is a skill, and because "we could not get it to work" and "this
is not possible" are very different sentences that look identical
from the outside.

## The request

The feature is easy to describe. You are sitting in front of the
television. Music is playing on a speaker in the kitchen through
NoMercy Connect. You press volume up on the television remote,
the one already in your hand, and the kitchen gets louder.

Every part of that is a thing NoMercy already does. Connect knows
which device is active. Devices already report and accept volume.
The only new piece is the input: a television remote's volume
keys, arriving at the television app, being routed to a different
device instead of to the television's own audio.

## What shipped first

The parts that were possible landed. Cast volume controls went
into the mini bar and the cast sheet, and they work. And a device
now proactively reports its real volume when it becomes the
active Connect device, rather than assuming anything about what
the session thinks it is set to.

That second one is the volume ownership rule, from part six,
arriving for the fourth time. In April it was Bluetooth and
hardware keys. In July it was the passive phone with no volume
slider. In August it is a television remote sending volume over
HDMI-ARC and CEC. The rule is the same every time and it has to
be reapplied by hand at each new physical input, because the
inputs arrive through unrelated Android APIs that share nothing.

## Where it stopped

The television remote's volume keys never reach the app.

That is the finding. Establishing it took direct instrumentation
of real hardware over ADB and logcat, and it went through two
separate attempts, the second of which was the "proper" Android
way and failed for the same underlying reason.

**Attempt one: handle the keys in `onKeyDown`.** The obvious
approach. Logcat on a Nokia Streaming Box showed the keys never
arriving. Android TV's `PhoneWindowManager`, in a method called
`interceptKeyBeforeQueueing`, claims HDMI-ARC volume keys and
routes them to the CEC and audio system before they are ever
dispatched to any application. This is not a policy the app can
opt out of. It is checkable against AOSP source, in
`frameworks/base/services/core/java/com/android/server/policy/PhoneWindowManager.java`.

**Attempt two: register a MediaSession with a
`VolumeProviderCompat`.** This is the correct, documented Android
API for saying "volume commands belong to me, and they are remote
volume." It is the thing NoMercy already uses successfully for
Bluetooth and hardware keys elsewhere.

It also cannot work here, and the reason is ordering.
`interceptKeyBeforeQueueing` runs before
`interceptKeyBeforeDispatching`, and MediaSession volume routing
depends on the latter. The keys are consumed one stage upstream
of the point where the API you are supposed to use gets to have
an opinion.

That distinction matters enormously. The second attempt did not
fail because of a bug or a misconfiguration or a missing flag. It
sits downstream of the interception point. It is architecturally
incapable of receiving the event, and no amount of getting the
implementation right changes that.

## How it was actually proven

Believing the above is not the same as having established it.
Three things were done, and they are the template.

**Read the platform source and cite the specific place.** Not
"Android intercepts volume keys," which is folklore. A named
method in a named file in AOSP, with the ordering relationship to
the other method spelled out. That is a claim somebody else can
check and disagree with.

**Test across hardware that differs in the relevant dimension.**
Four configurations were tried: a Samsung television with a real
CEC-negotiated ARC soundbar attached, a Sony television with an
eARC-capable port and no sink connected to it, that same Sony
television with a soundbar physically reattached partway through
the investigation, and the original streaming box. Those cover
the ARC negotiation states you could plausibly imagine mattering.
All four showed byte-for-byte identical interception behaviour.

If the behaviour had varied with the sink, the conclusion would
have been different and much more hopeful. It did not vary. The
interception is unconditional.

**Check whether the gate can legitimately be opened.** Android
has an `HDMI_CEC` permission. It is `signature|privileged`, tied
to the specific device manufacturer's platform signing key. And,
importantly, unlike Play Store restricted permissions there is no
declaration form and no application process for a third party
app. There is no route. Not a hard route, not a slow route, not a
route with paperwork. None.

That last check is what separates a wall from a locked door. Many
Android limitations look absolute and turn out to have an
application form attached. This one does not, and knowing that
required going and looking rather than assuming either way.

## The conclusion, stated plainly

On stock Android TV hardware, a third party application cannot
receive the television remote's volume keys and route them to
another device. It is not achievable in-app. Closed with
evidence.

Which is a genuinely fine outcome. The feature does not exist,
the investigation is written down, and if somebody asks for it
again in six months the answer takes ten minutes instead of a
week, because the reason is recorded rather than remembered.

The failure mode this avoids is the one where a feature gets
quietly dropped with a shrug and a note saying it did not work,
and then somebody with more optimism picks it back up two
quarters later and spends the same week discovering the same
thing.

Prove your walls. Then write them down.
