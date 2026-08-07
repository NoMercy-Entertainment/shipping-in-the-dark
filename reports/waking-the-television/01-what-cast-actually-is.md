---
title: "What Cast actually is, and what the docs let you assume"
part: 1
---

# What Cast actually is, and what the docs let you assume

Before any of the failures make sense, you need an accurate
mental model of Google Cast. The official documentation gives you
a model that works fine for the case it was written for, and
quietly misleads you for every other case.

## The model the docs give you

You have a sender. It is your phone app. You add the Cast SDK,
you get a cast button, the user taps it and picks a device. You
now have a `CastSession`. You get a `RemoteMediaClient` off that
session, you hand it a `MediaLoadRequest` containing a URL and
some metadata, and something on the television plays it.

The something on the television is a receiver. In the default
case it is a web page, hosted by you, running in a Chrome shell
on the Cast device. Google provides a ready-made one so that if
your media is just a URL, you do not have to write anything at
all.

That model is coherent and it works. It is also almost entirely
wrong for an app like NoMercy.

## Why it does not fit

NoMercy already has a television app. A real, native, installed
Android TV application with its own player, its own playlist
handling, its own subtitle rendering, its own authentication
against the user's own media server, and its own real time
control channel over WebSocket. It knows how to play the user's
library. It does not need to be told a URL.

If you use the documented path, you are asking the Cast SDK to
start a second, different playback system on the television, one
that knows nothing about any of that. You end up with two players
on the same device, competing for the screen.

There is an official answer to this, called Cast Connect. It lets
a Cast session launch your native Android TV app instead of a web
page, using an Android TV Receiver. This is the right family of
solution and NoMercy ended up there. But Cast Connect sits on top
of all the same machinery, and the machinery has opinions. The
web receiver does not go away just because you declared an
Android receiver. It is still there, it is still a fallback, and
when the conditions for launching your native app are not met, it
is what runs instead.

That fallback is the single most expensive fact in this entire
report. It is the source of the hijack, the ANR, and the two
month recurring bug.

## The three things Cast is actually good for here

Stripped down to what NoMercy genuinely needed, Cast provides
three capabilities that nothing else on the platform provides,
and one capability that had to be actively refused.

**Discovery, sort of.** The Cast SDK can enumerate Cast capable
devices on the network. NoMercy also runs its own discovery over
`_nomercy._tcp` mDNS, which is better because it finds NoMercy
specific detail, and worse because it only finds devices where
the app is currently running. A television with the app closed is
invisible to mDNS and perfectly visible to Cast. That difference
became a real bug and is covered in part seven.

**HDMI-CEC One Touch Play.** This is the big one. When a Cast
session starts against a television, the Cast receiver stack on
that device can send a CEC One Touch Play message over HDMI,
which physically wakes the panel and switches the input. There is
no public Android API for a third party app to do this. None.
Firing a Cast session is the only route a normal app has to it,
because the component that sends the CEC message holds a
signature level permission your app cannot get. This constraint
was discovered by trial, and it comes back in part twelve in a
far more painful form.

**A system initiated app launch.** When Cast Connect launches
your Android TV app, the launch is performed by a system
component, not by your process. That distinction sounds like
bookkeeping. It is the difference between the launch working and
the launch being silently dropped, because Android's background
activity launch restrictions apply to your process and not to the
system's. Parts nine and ten are about learning this the
expensive way.

**Media loading, which had to be refused.** `RemoteMediaClient`
and `loadMedia` are the centre of the documented API and NoMercy
must never call them. If Cast loads the media, Cast owns the
playback, and everything NoMercy's own player does becomes a
second source of truth fighting the first. The rule that
eventually got written down in the new player library's Cast plan
is four words long.

> Chromecast is wake-only, never media.

The Cast SDK appears in exactly one place, a component called
`CastWaker`, and only for route selection and the
`onSessionStarted` callback. Once the session has started and the
television is awake with the app in front, Cast has done its job
and NoMercy's own protocol takes over. `RemoteMediaClient`,
`MediaLoadRequest` and `loadMedia` are not permitted to appear in
the codebase at all.

That rule reads as obvious now. It is the distilled residue of
about six months of not knowing it.

## Two subsystems that look like one

There is a second distinction worth setting up early, because
collapsing it caused real bugs.

NoMercy has video casting and it has NoMercy Connect, which is
the multi device music system. Both let you push playback from
one device to another. They feel like the same feature to a user
and they are not the same feature at all.

Connect is NoMercy's own thing, over its own WebSocket hub, with
its own device registry, its own active and passive device model,
and its own volume semantics. Cast is Google's thing, used only
to wake hardware. An audit of the new player library was explicit
about the conclusion:

> Cast is a SEPARATE subsystem from Connect. They share nothing
> but the core plugin base. Do not fold them together.

They do touch in exactly one place: when Connect wants to hand
music to a television that is asleep, it uses Cast to wake it,
and then goes back to being Connect. Every attempt to make that
touch point more integrated than that produced a race condition.
Part four is the collection of those races.
