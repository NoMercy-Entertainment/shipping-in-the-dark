---
title: "What a plugin gets for free"
part: 3
---

# What a plugin gets for free

A plugin is a class. It extends `Plugin`, it declares a static
identifier, and it is registered with a player.

That is the whole ceremony. What makes it worth using rather than
writing your own event listeners is everything the base class
hands you, and specifically what it hands you around teardown.

## The disposal problem

Here is the bug that every player integration eventually ships.

You attach a listener. You start an interval. You open a resize
observer. Then the user navigates away, the player is disposed,
and your listener is still attached, your interval is still
ticking, and your observer is still watching an element that no
longer exists. Nothing crashes. Memory climbs, and a second
player mounted later receives events meant for the first one, and
you spend a day on it in three months' time.

The trio's answer is that a plugin never reaches for a global
directly. It uses its own scoped equivalents, and the base class
tears down exactly what that plugin created, at the moment it is
disposed.

Instead of the player's event bus, a plugin uses its own
`this.on`, `this.once`, `this.off` and `this.emit`. Same bus,
same events, but the subscription is bound to the plugin's
lifetime.

Instead of `setTimeout`, `setInterval`, `requestAnimationFrame`
and `addEventListener`, a plugin uses `this.timeout`,
`this.interval`, `this.frame` and `this.listen`. Observers go
through `this.lifecycle.observe`, so a `ResizeObserver` is
disconnected when the plugin goes away.

Instead of the global `fetch`, a plugin uses `this.fetch`. That
one is worth calling out, because it does two things at once. It
runs the request through the player's authentication pipeline, so
a plugin does not need to know how tokens are obtained, and it
aborts the request when the plugin is torn down, so a response
cannot arrive for a plugin that no longer exists.

And instead of throwing, a plugin uses `this.throw` or
`this.report`, which route into a structured error surface with
codes rather than a string that some consumer will end up parsing.

## The rule that is genuinely just a warning

Every one of those has a lint rule behind it, and every rule can
be switched off.

That is not an oversight. There are real situations where a
plugin needs the raw thing. A public URL that must not carry
authentication headers is the obvious one, and the rule for that
case is satisfied by an eslint disable comment with a reason
written next to it. Not a permission. A sentence explaining
yourself, to the next person, in the file.

There is one more rule worth explaining because it catches a
subtle failure. Every concrete plugin must declare its own static
identifier. If it does not, it inherits the base default, which
is the string `plugin`, and two plugins that both answer to
`plugin` collide in storage keys and mount namespacing. The
symptom is that one plugin's saved settings overwrite another's,
which reads as settings randomly resetting and takes a long time
to trace back to a missing line. Abstract intermediate classes
are exempt, because they are never registered.

## What this makes possible

The practical effect is that plugins compose without coordinating.

You can register five plugins that all listen to the same events,
built by five different people, and none of them needs to know
about the others. Each one cleans up after itself precisely. You
can add one at runtime and remove it again, and the player after
the removal is in the same state as the player before the
addition.

That is the foundation. It is not yet the interesting part.

The interesting part is that a plugin can not only observe what
the player does, but stop it, delay it, and replace it with
something else entirely. That is the next section, and it is the
reason this report exists.
