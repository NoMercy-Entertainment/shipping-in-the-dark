---
title: "Waking a sleeping panel, and the six races underneath it"
part: 4
---

# Waking a sleeping panel, and the six races underneath it

The twenty seventh and twenty eighth of April 2026 were spent on
one user gesture. Tap a television in the music device picker
while the television is off, and have music start playing on it.

Nine commits over two days. Every one of them is a different
thing that was silently wrong.

## The false start

The morning of the twenty seventh opens with an attempt to try
the Cast sender first for television taps, so that the Cast shell
fires CEC, and fall back to the WebSocket bus wake if that does
not work.

It was reverted the same day.

The reason the ordering mattered is subtle and it took another
three days to get right. Treating Cast as the primary and the
WebSocket as the fallback means you have to decide when Cast has
failed, and the honest answer is that you cannot tell quickly. A
Cast session that is going to succeed and a Cast session that is
going to fail look identical for several seconds. So the fallback
either fires too early, giving you two wake attempts racing, or
too late, giving you a dead button.

The design that landed three days later ran the Cast SDK in
parallel with the WebSocket wake rather than gating one behind
the other. That was better. It was still not right, and part
nine is about the day in August, three months later, when it was
finally understood properly.

## The one thing only Cast can do

The real attempt is a commit titled "wake TV panel via Cast SDK
and keep app foregrounded." Its findings are the load bearing
platform facts of this whole report.

**Cast route selection is the only path to CEC.** Firing HDMI-CEC
One Touch Play requires a signature level permission. The Cast
shell has it. Your app does not and cannot. Selecting a Cast
route is the only mechanism available to a third party
application that ends in a television physically turning on. This
was discovered by trying everything else first.

**MediaRouter returns an empty route list on cold start.** The
router keeps a cache of known routes. On a fresh process, the
cache is empty, and asking for routes gives you nothing rather
than an error. You have to start an active scan and wait. Code
that reads the route list synchronously and finds nothing
concludes there are no televisions, when what actually happened
is that it asked too early.

**A lingering previous session blocks CEC on a new one.** If an
old Cast session is still open, starting a new one does not fire
One Touch Play. The television stays off and everything else in
the flow reports success.

## The steal race

The next commit is my favourite bug in the old app, because the
failure is so human.

You tap the television in the picker. The phone sends a change
device command naming the television. The television begins
waking, which takes several seconds, during which it is not yet
present in the music hub's list of connected devices. About one
second in, the phone's own logic notices that music is playing
and no device is currently registered as active, so it helpfully
claims itself as the active device and sends a change device
command naming itself.

The phone wins. The cast reverts. From the sofa, you tapped the
television, the television started to wake up, and then playback
snapped back to your phone for no visible reason.

The fix was to only auto claim when no active device is
designated at all, which the commit notes matches Spotify's
behaviour. That reference is doing real work: when you are
building a multi device handoff, the correct semantics are mostly
already decided by the apps everybody has used, and copying them
deliberately is faster than deriving them.

## Four more, in one afternoon

The picker was passing a ULID where the music hub's change device
call expected a device fingerprint. The call did not error. It
simply never matched, so success was never recognised.

The wake intent triggered a full UI reload on every cast, even
when the app was already on the music route.

The television's Cast receiver message handler did not know about
music content at all, only video, so music messages arrived and
went nowhere.

A Cast sender fallback was added to the phone's music picker.

## The launch that aborted itself

The twenty eighth begins with a commit that moves the wake to
Cast Connect with a proper Android TV Receiver, and it carries
two platform gotchas that are worth the whole commit.

**Ending the session too early kills the launch.** The code was
ending the Cast session 2.5 seconds after One Touch Play fired,
on the reasoning that CEC had done its job and the session was
just overhead. With `androidReceiverCompatible` set to true, that
teardown aborts the launch intent. The Cast shell logs
`closed_by_peer` and never starts your activity. The television
turns on and shows nothing.

**Sideloaded builds fail a whitelist check you have never heard
of.** An APK installed with a plain `adb install` gets
`APP_NOT_INSTALLED_BY_WHITELISTED_INSTALLER` from Cast, and the
launch silently fails. Cast will only launch an app it believes
came from the Play Store. The workaround is the `-i
com.android.vending` flag on install, which tells the package
manager to record the Play Store as the installing package.
NoMercy's `deploy.sh` had to carry that flag permanently, purely
so that Cast's whitelist check would pass on development builds.

If you do not know that, your Cast Connect integration appears
completely broken on every device you own, and works fine for
anybody who installed from the store. Which is to say, it appears
broken exactly and only during development.

## Casting from the web, and the backdrop

Casts originating from the server side, through the sharpcaster
library, send a bare Cast launch intent with no DIAL extras
attached. The television's handler keyed on those extras to
decide the wake was a music wake, so web originated casts
launched the app and then did nothing. Fixed by treating a bare
launch as an implicit music wake.

Then the Backdrop. The Cast receiver SDK ships a component called
Backdrop, the ambient screensaver you see on an idle Chromecast.
It was drawing on top of NoMercy's music UI, because the receiver
SDK's media manager had no populated media status and concluded
nothing was playing. The fix pushes synthetic media info and
status so the SDK believes there is media.

The commit is honest about not finishing:

> Doesn't fully fix the Backdrop overlap when the cast launches
> against the Web Receiver placeholder session id. That needs a
> custom Cast Web Receiver page that proxies status to the
> Android app, tracked separately.

That was still open at freeze. Second of the four.

## The rest of the cluster

A cast with no content ID landed on the music start screen
instead of the full player overlay.

A real crash. A twenty second session start timeout fired on a
background thread and ran cleanup, which touched Cast SDK
objects, which threw "Must be called from the main thread." Fixed
by posting cleanup to the main looper. The Cast SDK is main
thread only and your timeout handler is not, and those two facts
only meet on the failure path, which is the path you test least.

Two unrelated and equally expensive things in one commit on the
thirtieth. R8 was stripping `Log.i` calls in production builds,
so the entire wake and auth handoff flow produced no logs on a
real release build. You could not debug the feature on the device
where it mattered without rebuilding. And separately: Samsung
Wi-Fi stacks silently drop multicast traffic, which kills mDNS
discovery of televisions. `NsdManager` reports success the whole
time. The fix is an explicit `WifiManager.MulticastLock`, which
is one line and completely invisible until you have a Samsung
phone in your hand and a television that everybody else can see.

Last of the cluster: music hub initialisation on televisions was
a fire once function gated on a feature flag. If the flag had not
hydrated yet at boot, which on a television it usually had not,
the function no-opped and was never called again. Televisions
silently never subscribed to the music hub for the entire life of
the process. Replaced with a reactive coroutine that watches for
the flag and acts when it arrives.

Hold onto that last one. The identical bug, same shape, same
cause, is fixed again in the new app in part seven. Some mistakes
are structural enough to survive a rewrite.
