---
title: "Why we built our own player"
part: 0
---

# Why we built our own player

Every media application eventually has the same argument with its
video player.

You want the player to do something slightly unusual. Fade the
volume down over two seconds instead of dropping it. Ask the
server before you allow a seek. Send the play button to a
television in the next room instead of the speakers in front of
you. Show your own progress bar, in your own colours, with your
own hover preview.

And the player says no.

Not with an error. Players almost never say no with an error.
They say no by having no opinion you can reach. The method you
need is private. The event you need fires after the thing already
happened. The button you want to move is drawn by a stylesheet
you cannot override without a selector war. The behaviour you
want to replace is welded to the behaviour you want to keep.

So you do what everyone does. You wrap it. You write a layer that
watches the player from outside and tries to keep a second copy
of the truth in sync with the first. That layer grows. It becomes
the largest file in your codebase, and every bug in it is a
timing bug, and every timing bug takes a day.

We have written that wrapper. More than once. The NoMercy player
trio exists so we never have to write it again, and so nobody
using our libraries has to write it either.

## What this report covers

This is a tour of three npm packages and the ideas underneath
them. It answers four questions, in order:

- What the trio is
- Why it exists at all, when good players already exist
- What it lets you build that you could not build before
- How far you can bend it before it breaks

The last question gets the most room, because it is the point.
Anyone can ship a player. The interesting question is what
happens when a developer wants something the authors never
imagined, which is most of the time, and which is the moment
almost every library fails.

## The short answer

There are three packages.

- `@nomercy-entertainment/nomercy-player-core` is the shared
  foundation. It knows about playlists, events, plugins, state
  and lifecycles. It does not know what a video is.
- `@nomercy-entertainment/nomercy-video-player` adds the things
  only video needs. Subtitles, quality levels, fullscreen, a
  picture on a screen.
- `@nomercy-entertainment/nomercy-music-player` adds the things
  only audio needs. Crossfading, gapless playback, queues that
  behave the way listeners expect rather than the way playlists
  are stored.

The version two line has been stable since the eighteenth of July
this year. It went out at 2.0.1 rather than 2.0.0, for a reason
that is a story in its own right and not this one.

They are headless. That word does a lot of work here, and it is
the second thing this report explains, so hold it lightly for
now. The short version is that the trio ships behaviour and
leaves appearance to you, which sounds like less and is
considerably more.

## The rule that shaped everything

There is one design rule in this project that explains most of
the decisions in this report. It comes from Stoney, who owns
NoMercy, and he wrote it down in July while we were arguing about
how strictly the libraries should enforce their own conventions.

> My goal is to have all player "enforce" the rules by providing
> guidance and steering by telling them that this is not the
> right way or better do that. But never to prevent the user from
> doing it anyway because they want to.

Read that twice, because the second half is unusual. Most
libraries treat a developer doing something unexpected as a
failure to be blocked. This one treats it as information. If
somebody reaches past the recommended path, the library's job is
to say so clearly and then get out of the way.

That single sentence is why there is not one `final` class, one
sealed method, or one thrown exception guarding an override
anywhere in the trio. It is why the conventions live in a linter
rather than in the type system. And it is why a plugin can
cancel, delay, or completely replace almost anything the player
was about to do.

The rest of this report is mostly the consequences of that
sentence.
