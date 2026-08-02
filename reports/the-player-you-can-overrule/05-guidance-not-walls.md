---
title: "Guidance, never walls"
part: 5
---

# Guidance, never walls

There is a decision in this project that a lot of library
authors would consider a mistake, and it is the decision the
whole trio is built on.

Nothing is sealed. No class is final. No method is truly private.
Nothing throws an exception to stop you overriding it. If you
want to reach into a part of the player we consider internal, you
can, and the library will not stop you.

## Why

The reasoning is short. Stoney wrote it in July, and it is quoted
in part zero, but the operative half is worth repeating on its
own:

> But never to prevent the user from doing it anyway because they
> want to.

The argument behind it goes like this. A sealed class is a bet
that the author imagined every legitimate use. That bet is always
wrong eventually. When it turns out wrong, the developer who
needed the unimagined thing does not shrug and go home. They fork
the library, or they vendor it, or they patch it at install time,
or they abandon it. Every one of those outcomes is worse for
everybody than if the door had simply been unlocked, because now
their change is invisible to us and unmaintained by anyone.

The phrasing we use internally is that if a construct prevents,
it is wrong. Guidance steers. Walls just relocate the problem
somewhere we cannot see it.

## So where do the conventions live

In a linter, which is exactly where an opinion belongs.

`eslint-plugin-player` is a separate package with its own version
line, currently ten rules, all shipped at error level in the
recommended preset. It carries only the parts of the standard a
machine can judge without guessing. Naming intent, whether a
comment earns its place, architectural fit — those stay with human
review, because a rule that has to guess produces noise, and a
noisy rule gets switched off wholesale along with the good ones
next to it.

The ten rules split into three groups.

Some are about clarity. No single-letter identifiers, with
exceptions for maths and loop counters. No object-literal casts,
because typing the object where it is constructed is better than
asserting its type where it is used. No unknown-to-type double
casts unless there is a justification written on the line above,
which again is a sentence to a future reader, not a permission.

Some are about not carrying version one's vocabulary into version
two. The old factory names, the old token types, the old class
name, and compatibility markers in comments all fail lint,
because a rename that only half happens is worse than either
state.

And some are the plugin discipline from part three. No reaching
for the player's raw event bus, no raw timers or observers, no
raw throws, no global fetch, and every concrete plugin declares
its own identifier.

## Every one of them is silenceable

That is the point of putting them in a linter rather than in the
type system.

A rule that fires at write time, names the better path, and can
be switched off with a comment is guidance. The developer sees
the recommendation at exactly the moment it is useful, and
retains the ability to disagree. When they disagree, the disable
comment is a record of the disagreement, sitting in the file,
readable in review.

A `final` keyword offers none of that. It does not explain, it
cannot be reasoned with, and the developer who needed to override
that method learns nothing except that this library is going to be
a problem.

Our position is that the linter is our voice, and consumers are
allowed to silence us. Being silenced by somebody who read the
warning and decided otherwise is a completely acceptable outcome.
It means the system worked.

## The honest caveat

This approach has a real cost and it would be dishonest to skip
it.

Because nothing is sealed, we cannot promise that reaching into
an internal will keep working. The public API is versioned and we
treat breaking it seriously. An internal you reached past is not
covered by that promise, and a minor release can move it.

That is the trade. You get the door unlocked, and in exchange you
accept that rooms behind unmarked doors get rearranged. We think
that is a much better deal than a locked door, because a locked
door does not actually protect you from the rearrangement. It just
guarantees you cannot get in at all.
