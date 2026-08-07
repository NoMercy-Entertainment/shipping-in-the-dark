---
title: "The hijack, four fixes, and the crash that ended them"
part: 5
---

# The hijack, four fixes, and the crash that ended them

This is the centre of the report. Six commits, one day, the
eighteenth of May 2026, ending with a mechanism being deleted
because it killed the app on a real device.

## The problem

The Cast Web Receiver was taking the television screen.

Recall from part one that declaring an Android TV Receiver does
not remove the web receiver. It is still registered, still a
valid target, and under conditions that were not fully understood
at the time, a Cast launch would resolve to it instead of to the
native app. The web receiver runs inside
`com.google.android.apps.mediashell`, Google's Cast shell, in its
own process, and it displays `CastWebContentsActivity`.

When that happens, the NoMercy app is pushed off the screen by an
activity in another process, and the user is looking at a blank
Chromecast page while their television app is still running,
invisible, behind it.

## Fix one: reclaim the foreground

The first commit is titled "strong lock against Cast Web Receiver
hijack." Three parts:

On the sender, `setStopReceiverApplicationWhenEndingSession(true)`
and `setResumeSavedSession(false)`, so old sessions do not linger
and get resumed into the web receiver.

On the television, a reclaim mechanism. Using
`ActivityLifecycleCallbacks`, detect when the app has lost the
foreground, check whether mediashell is on top by looking through
`ActivityManager.appTasks`, and if so call `startActivity` with
`REORDER_TO_FRONT` to put NoMercy back.

## Fix two: the check that could never be true

The second commit, the same day.

`ActivityManager.getAppTasks()` returns the tasks belonging to
the calling application. It does not and cannot return another
app's tasks. Searching that list for
`com.google.android.apps.mediashell` is searching a list that
structurally cannot contain it.

So the reclaim check never matched. Not sometimes. Never. The
entire mechanism from fix one was a no-op that logged nothing and
appeared to be installed correctly.

Replaced with `ActivityManager.getMyMemoryState`, which reports
the calling process's own importance, so instead of asking "is
mediashell on top" the code asks "am I still in the foreground."

## Fix three: the check that was true at the wrong moment

The reclaim ran once, 500 milliseconds after losing focus. But
mediashell takes roughly two seconds to actually display
`CastWebContentsActivity`. At the 500 millisecond mark, the
transition has begun and not finished, and `getMyMemoryState`
cheerfully reports that NoMercy is still foreground, because as
far as the process importance bookkeeping is concerned, it is.

So the reclaim looked, saw everything was fine, and went away
1.5 seconds before the hijack happened.

The fix: five staggered attempts at 300, 800, 1500, 2500 and 3500
milliseconds, and the importance check dropped entirely as
unreliable, keyed instead on `userLeavingNow`.

Notice what is happening to the design. Each fix removes a signal
that turned out to be untrustworthy and replaces it with more
attempts. That is the direction a design goes when nobody has
found the real seam yet.

## Fix four: the launch that was not a launch

The reclaim was now firing at the right times, and still not
reclaiming. Under Android's background activity launch
restrictions, a plain `startActivity` from an app that is not in
the foreground, with `REORDER_TO_FRONT` and `CLEAR_TOP`, resolves
to `START_DELIVERED_TO_TOP`. That result code means the intent
was delivered to the activity that is already on top of your own
task. It is a front swap within your task. It does not bring your
task to the front of the system.

So the call succeeded, returned a success-shaped result, and
changed nothing visible.

Replaced with `appTask.moveToFront()` plus a delayed follow up
`startActivity`.

## Fix five: rip it out, it crashed the app

The fifth commit of the day is titled "rip out Cast reclaim, it
ANR'd the app."

Here is the loop that had been built without anyone intending to
build it.

The reclaim was scheduled from `MainActivity.onPause`. Five
attempts get queued. An attempt calls `moveToFront()`. That
brings the activity forward, which fires `onResume`. Something
takes focus again, or the next queued attempt lands, and the
activity pauses. `onPause` fires. Five more attempts are
scheduled. Each of those calls `moveToFront()`.

Every reclaim attempt could produce five more reclaim attempts.
On the main thread. The `MessageQueue` backlogged, the `Handler`
lock seized, and Android killed the process. The device produced
an APP-004 device malfunction report, and the ANR stack trace was
pasted directly into the commit message, which is the correct
thing to do and also a slightly grim thing to read.

The commit is explicit about what state it leaves things in:

> The Web Receiver hijack still exists but is far less harmful
> than the ANR. Real fix needs a different vector: blocking the
> Cast LAUNCH intent at the receiver side, or a foreground
> service plus full screen intent path.

Neither of those two vectors was ever implemented in that
repository. The hijack was never solved on the old app. Third of
the four things still open at freeze.

## The knock-on

A commit in the music player, the same day, names this cascade
directly as a contributing cause of an apparently unrelated bug.
It refers to "the cast-receiver cascade that ended in an ANR" as
part of the reason passive music devices needed their audio
engines torn down entirely. Part six is that rewrite.

## What was actually wrong the whole time

Every one of these five commits accepts a premise: that the web
receiver will take the screen, and that the app's job is to take
it back. Under that premise the work is correct and the
escalation is logical. Detect better, retry more, use a stronger
API.

The premise is wrong. Fighting another process for the foreground
on Android is a fight you lose, because the system arbitrates it
and the system's rules are not on your side. If the web receiver
is winning the launch, the answer is to stop the launch resolving
to the web receiver.

Which is what the commit message says. It knew. It just did not
have the time or the understanding of the launch path to do it,
and shipping a hijack was better than shipping a crash.

The new app got there, eventually, and it turned out to take
three separate fixes in three separate codebases, because the
same visible symptom had three independent causes. That is parts
seven and eight.
