---
title: "What it is actually for"
part: 7
---

# What it is actually for

The trio exists because NoMercy needs a player. That is the
boring reason and it is true.

It is built the way it is built for a different reason, and the
goal was stated plainly in July:

> Build the best audio and video tooling that exists for
> developers.

Not the best player. The best tooling. The distinction runs
through every decision in this report.

A player is judged by whether it plays the thing. Tooling is
judged by what happens on the developer's second day, when they
want something the authors did not anticipate. That is why
developer experience is treated here as an acceptance criterion
rather than as polish to be added if there is time. A change that
makes the library harder to extend is not finished, in the same
way that a change that fails its tests is not finished.

## One model, several platforms

The stated goal is one model across web, Android, iOS and
desktop. The same concepts, the same event vocabulary, the same
plugin lifecycle, the same before-hooks, wherever a developer
happens to be working.

The web trio is the reference implementation of that model, and
it is the one this report describes. Work is under way to carry
the same shape onto native platforms. That work is not finished,
and it is not described here, because describing an unfinished
port as though it were shipped is exactly the kind of claim this
journal exists to avoid making.

What is worth saying is why one model matters at all. A developer
who learns this player on the web should be able to move to
another platform and already know how it works. Learning a
library is a real cost, and paying it once instead of four times
is most of the value of building a family rather than four
separate things.

## Who this is for

Three audiences, honestly ranked.

We are the first. NoMercy uses these libraries in its own
applications and every rough edge in them is a rough edge in our
own product first. That is a decent alignment guarantee and it is
also a limitation, because it means the paths we walk are smooth
and the ones we do not walk may not be.

The second is anyone building a media application who has hit the
wall described in part zero. The wrapper that grows, the timing
bugs, the theme fight. If any of that sounded familiar, the trio
is aimed squarely at you, and the before-hooks are the part to
look at first.

The third is people who want to build on top rather than beside.
A plugin that does something we never thought of, using exactly
the interfaces our own plugins use, with nothing sealed against
it. If somebody ships a plugin for these players that we did not
write and could not have designed, that is the clearest possible
signal that the ideas in this report actually hold.

## The one thing to take away

If you read nothing else, read this.

Most player libraries are built to be used. This one is built to
be argued with. It asks before it acts, it lets you cancel, it
lets you delay while you go and check something, and when it
thinks you are doing it wrong it says so in a warning you are
free to switch off.

That is not permissiveness for its own sake. It is a bet that the
developer on the other side has a reason we have not thought of,
and that the cost of trusting them is lower than the cost of a
fork.

So far the bet is holding.
