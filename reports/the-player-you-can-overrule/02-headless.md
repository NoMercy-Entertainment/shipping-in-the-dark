---
title: "Headless, and why that is the whole point"
part: 2
---

# Headless, and why that is the whole point

A headless player ships behaviour and no appearance.

It will load your media, decode it, manage a queue, track
position, handle subtitles, expose every piece of state, and fire
an event for everything that happens. It will not draw you a play
button. It will not inject a stylesheet. It will not decide that
the progress bar goes at the bottom.

If that sounds like extra work, it is, and it is worth being
honest about the cost before explaining the benefit.

## The cost, stated plainly

When we migrated our own web application from version one to
version two, a stream of things broke. Not subtly. Buttons
vanished, keyboard shortcuts stopped working, styling that had
always been there was simply gone.

Every single one of those reports had the same cause. Version one
baked those behaviours in and injected its own CSS at runtime.
Version two, being headless by design, leaves all of it to the
consumer. Nothing was broken. Everything that disappeared was
something version one had been doing for us silently, and version
two expected us to ask for.

That is the real cost of headless and there is no way around it.
A headless player hands you a longer first day.

## What you get for that day

You get a player that never fights you.

Consider what "the player draws its own controls" actually
commits you to. The library now owns a piece of your screen. It
has opinions about layout, about colour, about focus order, about
what happens on a narrow window. Every one of those opinions is a
thing you will eventually want to change, and every change is a
negotiation with a stylesheet written by somebody who could not
see your design.

The usual escape hatch is a theming API. Themes work until the
day you want something the theme author did not anticipate, and
then you are back to fighting selectors, except now you are also
fighting a theme.

A headless player has no opinions to fight. The progress bar goes
where you put it, because you drew it. The controls look the way
your design system says, because they are your components. You
are not overriding anything, so there is nothing to override you
back.

## The part that surprises people

Headless does not mean you start from nothing.

The trio ships plugins in the box. Chrome, keyboard handling,
subtitle rendering, media session integration, gesture handling,
cast sending. They exist, they are maintained, and they are good.
They are simply off unless you ask for them.

Stoney described the model he wanted back in May, and it is the
line that settled the argument:

> You know I love plugins we ship by default and let the user opt
> into them.

So the first day is longer than a batteries-included player, but
it is much shorter than a from-scratch one. You register the
plugins you want, you skip the ones you do not, and the ones you
skip cost you nothing at runtime because they were never
constructed.

And crucially, a shipped plugin is not privileged. It is written
against exactly the same interfaces your own plugin gets. There
is no private channel, no internal API that the built-ins use and
you cannot. If our chrome plugin can do it, yours can too, which
means "replace the built-in with my own" is a supported path
rather than a fork.

That is what the next section is about.
