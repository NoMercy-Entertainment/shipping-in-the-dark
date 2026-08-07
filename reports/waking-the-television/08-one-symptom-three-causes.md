---
title: "One symptom, three causes, three codebases"
part: 8
---

# One symptom, three causes, three codebases

Fixing the receiver lifecycle in part seven was necessary. It was
not sufficient. The visible symptom, Google's generic Cast web
page taking over the television and pushing the NoMercy app off
the screen, had three independent causes living in three
different codebases, and each one produced the identical picture
on the same television.

This is the part of the report I would most want somebody to read
before they start debugging their own Cast integration. One
symptom is not one bug. It is a symptom.

## Cause one, on the television: the receiver was switched off

Covered in part seven. A lifecycle callback mismatch left the
native Android TV receiver stopped, so launches fell through to
the web receiver.

## Cause two, on the web sender: nobody told Cast it was allowed

Early July, in `nomercy-app-web`, the browser app.

The web sender's Cast session options never declared
`androidReceiverCompatible: true`.

That flag is how a sender tells the Cast SDK that this
application has an Android TV receiver and that launching it is
acceptable. Without it, the SDK does not consider the native app
at all. It launches the generic web receiver, every time, on
every Android TV, and the native app that was running gets pushed
aside.

Note what that means alongside cause one. Even a perfectly
behaved native receiver, started and stopped on exactly the right
callbacks, running happily on the television, could not help,
because the sender never asked for it. The two bugs are
completely independent, in different languages, in different
repositories, maintained as different concerns, and they produce
pixel-identical failures.

If you had fixed either one alone and tested from the wrong
device, you would have concluded your fix did not work.

## Cause three, on the web sender: a zombie session resuming itself

Mid July, after the first web fix was in, a report kept coming
back with a very specific and very misleading description. The
Chrome web cast launches after the player starts playing again.

Read that as a bug report and you form an immediate theory.
Something in the playback start path is triggering a cast. Look
at the play handler. Look at what fires on `playing`. Look at
whether the player is touching the Cast SDK on resume.

That theory is wrong, and the commit that fixed it says so
directly:

> That is the "chrome web cast launches after the player starts
> playing again" report: it isn't triggered by playback at all,
> it's the zombie resuming as the watch page loads.

The web app was using the `ORIGIN_SCOPED` auto-join policy, and
there was no `endCurrentSession` call anywhere in the codebase. A
Cast session from earlier, never properly ended, remained
resumable for the whole origin. On any later page load anywhere
on the site, the SDK silently rejoined it, and rejoining it
relaunched the web receiver on the television. No user action.
No button. No playback involvement whatsoever.

The correlation with playback was real and entirely incidental:
the watch page is the page people load when they are about to
play something, so the zombie resumed at almost exactly the
moment playback started.

The fix was to switch to `PAGE_SCOPED` auto-join and to force an
end on any session the SDK reports as already resumed.

## The wrong theory that was eliminated first

There is a plausible-sounding explanation for a hijack like this
that is worth knowing was checked and ruled out: a mismatched or
stale Cast application ID, so that the sender is launching a
different receiver application than the one you built.

It was not that. The web app's Cast application ID was set once
when Cast was introduced and never changed since. That is a
quick check on a version history, it eliminates an entire family
of theories, and it is the reason attention went to session
policy instead of spending a day on configuration.

Eliminating a wrong theory cheaply is worth as much as confirming
a right one, and it is much easier.

## And the smaller stuff

A cluster of hardening followed on the web sender in August, none
of it individually dramatic:

- The wake now waits for the television to actually be there,
  rather than for the Cast session object to open, which happens
  much earlier.
- The device chooser could hang when the device list came back
  empty.
- A session request promise had no bound and could stay pending
  indefinitely.
- The poll loop that watched for the television never gave up
  when the television was unreachable.
- Content Security Policy in production blocked the fetch that
  loads the Cast SDK, so the whole feature was absent in the
  environment that matters and present everywhere else.

That last one deserves a moment. A production-only CSP failure
means the feature works on every developer machine and is missing
for every user. It is the same shape as the Play Store installer
whitelist from part four, in the opposite direction, and both are
arguments for testing the environment users actually hit rather
than the one you have open.
