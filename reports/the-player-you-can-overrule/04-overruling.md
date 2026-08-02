---
title: "Overruling the player"
part: 4
---

# Overruling the player

This is the part that matters.

Everything so far has been about a player that stays out of your
way. This section is about a player that lets you take the wheel
mid-corner. Not by subclassing it, not by monkey-patching it, and
not by racing it with a wrapper that keeps a second copy of the
truth.

The mechanism is one idea, applied consistently: before the
player does anything meaningful, it asks.

## The before-event contract

Every action worth intercepting has a paired event whose name
starts with `before`. Play has `beforePlay`. Pause has
`beforePause`. Seeking has `beforeSeek`. There are many of them,
and they all hand your listener the same object.

```ts
export interface BeforeEvent<TData> {
  data: TData;
  preventDefault(): void;
  isDefaultPrevented(): boolean;
  stopImmediatePropagation(): void;
  isPropagationStopped(): boolean;
  delay(promise: Promise<unknown>): void;
  isDelayed(): boolean;
}
```

If that shape looks familiar, it should. It is deliberately the
same vocabulary as a DOM event, because that is a contract every
web developer already has in their hands and there was no reason
to invent a second one.

Four capabilities, and they compose.

**`data` is mutable.** Your listener can change the payload
before the action runs. A seek to a position your application
considers out of bounds can be clamped rather than refused.

**`preventDefault()` cancels the action outright.** The player
does not play. Not "plays and then pauses", which is the usual
approximation and the reason wrappers flicker. The state mutation
does not happen.

**`stopImmediatePropagation()` stops later listeners running.**
Notably, it does not cancel the action on its own. If you want
both, you call both. Keeping those separate is a small thing that
saves a specific confusion, because "I do not want other plugins
to see this" and "I do not want this to happen" are genuinely
different intentions.

**`delay(promise)` blocks the player on your promise.** This one
is the sharpest tool in the set. Your listener can go and ask a
server something, and the player waits. Multiple listeners can
each delay, and the delays compose through `Promise.all`. If any
of those promises rejects, the action is prevented, which means
"ask the backend for permission and do not play if it says no" is
a handful of lines rather than a state machine.

Delays are bounded. `setup({ beforeEventTimeoutMs })` caps how
long the player will wait, and it defaults to ten seconds. A
plugin that hangs cannot hang the player forever.

## What this makes possible

Take the casting example from part one, because it is the reason
most of this exists.

A device that is currently playing somewhere else needs to
behave, locally, like a remote control. Pressing play should not
start audio in this browser tab. It should tell the television to
play, and then reflect what the television reports back.

With before-events, that plugin is close to trivial to describe.
Listen for `beforePlay`. Call `preventDefault()`. Send the
command to the hub. Done. The local player never produces a
sound, never enters a playing state it will have to be dragged
out of, and never needs a second copy of the truth kept in sync
with the first.

The same shape covers the whole surface. Volume, mute, repeat,
shuffle, playback rate, subtitle selection, audio track
selection, language. Each has its own before-event, each can be
intercepted, each can be routed somewhere else entirely.

There is also `beforeTransfer`, for the handoff itself, and
`beforeDispose`, which lets a plugin finish its business before
the player goes away.

## The trap, and how it got fixed

Now the part that is genuinely instructive, because the first
version of this did not work and the reason is a good lesson.

Alongside the named before-events, core has a generic guard
called `beforeMutation` that fires for state mutations broadly.
It is useful, and it has a cost: some state changes happen very
often. Position updates fire continuously during playback.
Bandwidth samples arrive constantly. Firing a cancellable event
for every one of those is real overhead for something almost
nobody wants to guard.

So there is a list of hot mutations that skip the generic guard
unless you opt in.

```ts
export const HOT_MUTATIONS: ReadonlyArray<string>
  = ['time', 'bandwidth', 'recordMetric'] as const;
```

The opt-in is `setup({ mutationGuards })`. Pass `false` and the
guard never fires. Pass `'all'` and it always does. Pass an array
of method names and normal mutations fire while the hot ones you
named join them. Leave it unset, the default, and normal
mutations fire while hot ones stay quiet.

Here is the problem. `volume` and `playbackRate` used to be on
that hot list.

Which meant a casting plugin trying to intercept a volume change
got nothing at all, by default, silently. It would work perfectly
in a test where somebody had configured `mutationGuards`, and do
nothing in an application that had not. The plugin was correct.
The player was correct. The default made them incompatible, and
the failure mode was silence rather than an error.

The fix was not to make the plugin configure the player. Asking
every consumer to pass a specific configuration object before an
official feature works is how you get bug reports for years.

`volume` and `playbackRate` came off the hot list and got their
own dedicated hooks, `beforeVolume` and `beforePlaybackRate`,
which fire always and are not governed by `mutationGuards` at
all. A plugin can now intercept them without the application
knowing anything about guard configuration. `time` was already
handled this way through `beforeSeek`.

The principle underneath is worth more than the fix. If a feature
you ship depends on a hook, that hook cannot be behind a
performance flag that defaults to off. Either it is always
available or the feature is conditional on configuration nobody
will remember to write.

## Proving a cancellation actually cancels

There is a test file in core that locks this contract down, and
what it asserts is more interesting than that it exists.

It covers ten hooks: `beforeVolume`, `beforeMute`,
`beforeRepeat`, `beforeShuffle`, `beforePlaybackRate`,
`beforeLanguage`, `beforeSubtitle`, `beforeAudioTrack`,
`beforeDispose` and `beforeTransfer`. For each one it proves
three separate things.

First, that an action with no listener attached still works.
That sounds trivial and it is the check most people skip. Adding
a hook to an action is an opportunity to break the action, and a
suite that only tests the hook will not notice.

Second, that `preventDefault()` stops the state mutation dead —
and this is asserted by reading the state back afterwards, not by
observing that a prevented event was emitted. Those are different
claims. A player can emit "I was prevented" and change the state
anyway. Only one of those two checks can tell.

Third, that a paired event fires afterwards carrying
`reason: 'listener-prevented'`, so an application can tell the
difference between a plugin declining an action and the action
never having been requested.

The two hooks carved out of the hot list get a fourth check: that
they fire with no `mutationGuards` configuration set at all. The
bug had a test written against it, in the shape of the bug, so it
cannot come back quietly.
