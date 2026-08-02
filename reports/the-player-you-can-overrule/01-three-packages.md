---
title: "Three packages and five layers"
part: 1
---

# Three packages and five layers

The hardest question in this project is not technical. It is
"where does this code go".

It comes up constantly. Somebody adds a feature and it could
plausibly live in four places. Put it too low and every consumer
inherits an opinion they did not ask for. Put it too high and
three different applications write the same thing three times,
slightly differently, and the bugs are all different too.

We lost this argument to ourselves for long enough that we
eventually hired an agent whose entire job is answering it. Her
name is Spine, she is the player architect, and the boundary she
owns has five layers.

## The five layers

Before the table, in plain words. The bottom layer is the media
server, which knows about your library and your account. Above it
sits the shared core, which knows nothing about NoMercy at all.
Above that sit the two players, each knowing only about its own
medium. Above them sit plugins we ship in the box, and finally
plugins that a specific application writes for itself.

| Layer | What lives there | What it is allowed to know |
|---|---|---|
| Backend | The media server | Your library, your account, server protocols |
| Core | `nomercy-player-core` | Generic contracts only. Nothing NoMercy |
| Per-library | `nomercy-video-player`, `nomercy-music-player` | One medium's specifics |
| Built-in plugin | Ships with a player, off unless you opt in | Its own feature |
| Consumer plugin | Written by the application | Anything it likes |

The rule that makes this workable is the last row. Anything
NoMercy-specific lives in a consumer plugin. Not in core, not in
the video player, not in a built-in. If it knows what a NoMercy
account is, it lives in the application.

That rule has teeth, and the best proof is our own casting
feature.

## Connect is a plugin, and that is deliberate

NoMercy Connect is the feature that lets you start an album on
your phone and move it to a television without missing a beat. It
is one of the most NoMercy-shaped things we build. It talks to
our server, over our hub, about our devices.

It would have been extremely easy to put it in the music player.
It is, after all, a music feature, and the music player is where
music features go.

We put it in the application instead. It is a consumer-layer
plugin living in the web app beside the video player's equivalent,
switched on by a feature flag, and the music player has no idea it
exists.

The reason is a question we asked in July and could not answer
well: what happens when somebody who is not us installs
`nomercy-music-player`? They get a music player. If Connect lived
in the library, they would also get a device-handoff system
pointed at a server they do not run, wired to a protocol they
cannot speak, that they cannot remove because it is welded to the
volume control.

So Connect stayed outside. Which immediately raised a much better
question, and one that turned out to be the most productive
question in the whole v2 cycle.

If casting lives outside the player, and casting has to intercept
play, pause, seek, volume, mute, repeat, shuffle, playback rate,
language, subtitle and audio track — then what does a player have
to expose for something outside it to intercept all of that?

The answer to that question is part four, and it is the heart of
this report.

## What the split bought

Splitting core from the two players was not free. It cost a long
sequence of release candidates and a fair amount of arguing about
which package a method belonged to.

What it bought is that the two players are genuinely the same
player. The queue behaves identically. The event names are
identical. A developer who learns the video player has already
learned the music player, because the parts that differ are
exactly the parts that should differ and nothing else.

That symmetry is not an accident and it is not maintained by
discipline. It is checked. Two headless tools sit beside the
libraries: one extracts every event name, payload, public method
signature and error code straight out of the source, and the other
runs behavioural scenarios against both real players through a
shared harness. If music grows a method that video should have and
does not, something says so.

Those two tools have their own story, and it is a slightly
embarrassing one, so it gets its own section later.
