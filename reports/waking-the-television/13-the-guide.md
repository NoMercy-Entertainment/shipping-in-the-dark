---
title: "The guide: how not to spend nine months on this"
part: 13
---

# The guide: how not to spend nine months on this

Everything here is grounded in an incident from an earlier part
of this report. There is no generic Android advice in it. If a
rule sounds obvious, it is because you are reading it after the
story rather than before it.

The audience is specifically a developer building Google Cast
support in an Android app that also ships a television or
leanback interface inside the same bundle. That structure causes
several of these problems and makes several of the others much
harder to notice.

## Architecture

**Cast is wake-only if you have your own playback protocol.**

If your app already knows how to play your content, do not let
Cast load media. No `RemoteMediaClient`, no `MediaLoadRequest`,
no `loadMedia`. Use Cast for exactly two things: getting the
television powered on through CEC, and getting your own app to
the front. Then hand over to your own protocol and treat the Cast
session as finished business.

The moment Cast loads media, you have two playback systems on one
device, each with its own state, and every feature you build
afterwards has to be mirrored across both. The old app spent
months in that condition. The rule that got written down in the
end is four words: Chromecast is wake-only, never media.

If your app does not have its own playback protocol, ignore this
rule entirely. The documented path is fine and it is what it is
for.

**Keep Cast separate from your own multi-device system.**

If you have your own device handoff feature, Cast is not part of
it. They look like the same feature to users and they share
nothing except one touch point, which is using Cast to wake
hardware that your own protocol cannot reach because it is
switched off. Everything that tried to blur that line in this
project produced a race condition.

## Lifecycle

**Start and stop the receiver on `onStart` and `onStop`. Never
`onPause`.**

This is the single highest value rule in this document. It was
hit twice: once as a two month mystery that was never solved on
the old app and was fought with a foreground reclaim chain that
ended in an ANR, and once as a clean root cause and fix on the
new app.

`onPause` fires when anything takes focus. A dialog. The
screensaver. A system overlay. A picture-in-picture transition.
`onStart` only fires again if the activity was fully stopped
first, which a dialog does not do. Start on `onStart` and stop on
`onPause` and your receiver goes off at the first dialog and
never comes back for the life of the process.

The symptom does not look like a lifecycle bug. It looks like
Google's Cast web page randomly hijacking the television, because
that is what happens when a launch cannot find a live native
receiver.

Two things make this rule stick in practice. Extract the receiver
lifecycle into its own class rather than leaving it inline in the
activity. And name its methods for visibility, `onVisible` and
`onHidden`, not for activity callbacks. If the method is called
`onHidden`, nobody wires it to `onPause`, because `onPause` does
not mean hidden.

Make it idempotent, retry safe on a failed start, and fail open
on a failed stop. A receiver left running is a far smaller
problem than a receiver stuck off.

**Teardown must not run on a scope owned by the thing being torn
down.**

Stop casting closed the cast screen first, which cancelled the
coroutine scope the teardown network call was on, so the stop
never left the device and the television carried on playing. Put
teardown on a manager-owned scope that outlives the UI.

## Launching and waking

**The Cast session is your one system-exempt launch path.**

Android's background activity launch restrictions apply to your
process. They do not apply to a launch performed by a system
component. A Cast session started from the foreground launches
your Android TV receiver through the system, which is why it
works when everything else you try does not.

**If your wake needs a special permission, you have misdiagnosed
the problem.**

`SYSTEM_ALERT_WINDOW`, a `BOOT_COMPLETED` receiver, an exact
alarm, any special access grant. If your launch or wake path
depends on one of those to be reliable, stop and find the
sanctioned mechanism, because there is one and it is the Cast
session.

This project used all three of those workarounds at different
points and deleted all three. The overlay permission one is the
sharpest: it was load bearing in the design for months and was
never granted on the target hardware, so the path it enabled had
never once worked. YouTube Music does not hold that permission
and wakes televisions perfectly, using nothing but a
foreground-launched Cast session.

Three checks before you write the workaround. Does a first-party
app do this without the permission? Would you be comfortable
explaining the permission prompt to a user with a D-pad? And is
the permission even granted on your actual target device right
now?

**Do not fight another process for the foreground.**

If the system put someone else on screen, ask why the system made
that decision. Overriding it with `startActivity` from the
background gives you `START_DELIVERED_TO_TOP`, which is a
success-shaped no-op. Escalating to `moveToFront` on a timer
gives you, in this project's case, a feedback loop through
`onPause` that backlogged the main thread and got the process
killed.

**Give the wake the time the hardware actually takes.**

Measured cold wakes of a real streaming box came in at 8.2
seconds, 18.1 seconds, and one over twenty. A twenty second
timeout, which felt generous, cut off a wake that was going to
succeed. Measure your slowest target device and set the timeout
from the measurement, not from feel.

## Traps specific to this platform

**Do not trust `PowerManager.isInteractive` on television boxes.**
It lies. The box, the panel and the HDMI sink have independent
power states and the API collapses them into one boolean that is
confidently wrong often enough to break your feature. Do not gate
your wake on it. Just attempt the wake. Waking an awake device
costs nothing.

**MediaRouter's route list is empty on cold start.** It is a
cache, not a query. Start a scan and wait rather than reading it
synchronously and concluding there are no devices.

**A lingering previous Cast session blocks CEC on a new one.**
End sessions properly.

**Do not end the Cast session early to save resources.** With
`androidReceiverCompatible` set, tearing down the session shortly
after CEC fires aborts the app launch intent. The Cast shell logs
`closed_by_peer` and your activity never starts. The television
turns on and shows nothing.

**Install development builds with `-i com.android.vending`.**
Cast refuses to launch an app it does not believe came from the
Play Store, with `APP_NOT_INSTALLED_BY_WHITELISTED_INSTALLER`,
silently. Your integration will appear completely broken on every
device you own and fine for everyone who installed from the
store. Put the flag in your deploy script permanently.

**Take a `WifiManager.MulticastLock` if you use mDNS.** Some
Wi-Fi stacks, Samsung's among them, silently drop multicast.
`NsdManager` reports success throughout.

**Do not strip your logs in release builds.** R8 removing `Log.i`
made the entire wake and auth flow undebuggable in exactly the
build where the bugs lived.

**The Cast SDK is main thread only, including on your failure
paths.** A timeout handler running cleanup off the main looper
crashed the app. The failure path is the path you test least and
the one that touches the SDK from the wrongest thread.

## Sender side, if you also have a web app

**Set `androidReceiverCompatible: true` in your session
options.** Without it, the SDK will not consider your native
Android TV receiver at all and will launch the generic web
receiver every time. A perfectly behaved native receiver cannot
save you, because the sender never asked for it.

**Use `PAGE_SCOPED` auto-join, and end sessions you find already
resumed.** With `ORIGIN_SCOPED` and no `endCurrentSession`
anywhere, a leftover session silently rejoins on any later page
load and relaunches the web receiver with no user action at all.
This one presented as "the cast launches when playback starts,"
which is a completely misleading description, because the page
people load before playing something is the watch page.

**Check your production Content Security Policy allows the Cast
SDK fetch.** It works on every developer machine and is absent
for every user otherwise.

## Contracts, if you have your own server

**Reject what you do not understand. Do not swallow it.**

Every server side bug in this project was silent. A client had
been sending an empty device identifier to release its claim, and
the server ignored empty identifiers, so a graceful release had
never worked for an unknown length of time with zero evidence
anywhere. A case-sensitive lookup in a hub where everything else
was case-insensitive produced silent misses. A reverse proxy
allowed POST and not PATCH, so all the transport controls worked
and all the track selection controls did nothing at all. A field
name in the wrong casing convention simply arrived as absent.

A loud rejection is a bug report that writes itself, delivered to
the person who caused it, at the moment they cause it. Graceful
handling of input you do not recognise is how a broken assumption
ships on both sides and lives for months.

**Watch for the same value meaning different things.** A volume
sent as a display hint on a connect query string was being used
to overwrite the device's persisted level on every reconnect.

**A device's last-seen address is a fact about a path, not about
a device.** A television that reached you through a tunnel gives
you a public address that is useless for the phone sitting three
metres away from it on the same Wi-Fi. Both the proxy and the
cast launch dialled it, and timed out for seconds, from inside
the same house.

## Volume ownership

**A passive device never owns the volume channel.**

If your device is participating in a session that is playing
somewhere else, a volume input arriving at it almost certainly
means the device that is making sound, not this one. Turning up
your own silent stream is a correct-looking no-op.

This rule has to be reapplied at every physical input separately,
because they arrive through unrelated APIs. In this project it
was learned for hardware buttons, then again for Bluetooth, then
again for a phone with no in-app slider, then again for a
television remote over CEC. Nothing connects them. Each one is a
new place to get it wrong.

**Restore the receiving device's own remembered level on
handover.** Do not transplant the sender's. Eighty percent on a
phone and eighty percent on a television amplifier are not
comparable quantities.

**Guard against feedback loops when two systems can both set and
observe volume.** This project needed an input-origin lock with a
three second ownership window so CEC echoes could not clobber a
value the user just set, plus a self-write echo suppressor so the
app's own write did not return through a `ContentObserver` and
get treated as a user action.

## How to verify anything in this document

**Real device, real logcat.** Almost nothing in this report was
provable in a unit test. The lifecycle fix has seven good unit
tests and they were written after the root cause was found on
hardware, not before. The tests protect the fix. They did not
find it.

**Prove the test red first.** The fix for a television that
vanishes mid-session was verified by forcing its detection
condition to always be false and watching the test fail, then by
force stopping the app on a real television and timing how long
the phone kept showing a remote. Nine seconds. A green test you
have never seen fail proves nothing.

**Test the environment your users are actually in.** The Play
Store installer whitelist breaks development and works in
production. The Content Security Policy does the opposite. Both
are invisible from the other side.

## When it looks impossible

Sometimes it is. The way to establish that, rather than assume
it, has three steps, all used in the HDMI-ARC investigation in
part twelve.

**Cite the platform source, specifically.** Not "Android
intercepts volume keys." A named method in a named AOSP file,
with its ordering relative to the other relevant method spelled
out, so that somebody can check you and disagree.

**Test across the dimension you think might matter.** Four
hardware configurations covering every ARC negotiation state that
could plausibly change the behaviour. Identical results across
all four turned a suspicion into a finding. Varying results would
have turned it into a lead.

**Check whether the gate can legitimately be opened.** Many
Android restrictions have a declaration form attached. Look for
it. `HDMI_CEC` is `signature|privileged`, tied to a specific
manufacturer's platform signing key, with no third-party
application process of any kind. That is the difference between a
wall and a locked door, and you only find out by going and
looking.

Then write it down. A proven wall costs a week once. An assumed
one costs a week every time somebody optimistic comes along.
