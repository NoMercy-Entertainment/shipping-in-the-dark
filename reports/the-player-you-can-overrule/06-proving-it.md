---
title: "Proving any of this is true"
part: 6
---

# Proving any of this is true

A report that says "everything is overridable" is worth nothing
without something that checks it.

This section is about the three things that do the checking, and
about the fact that two of them arrived three months later than
they should have, for a reason that was reasonable at the time
and wrong.

## The testbed

`player-testbed` is a small application built with Vue and driven
by Playwright. It is a reference consumer, and its job is
specific: every public method the libraries expose should be
reachable from a real button in a real page.

That constraint is more useful than it looks. An API that is easy
to call from a unit test can still be miserable to use, because a
unit test constructs whatever state it needs directly. A button in
a page has to get there the way an application would, through the
real lifecycle, in the real order. If a method needs four things
set up first and the testbed cannot arrange them from a click,
that is not a testbed problem.

The testbed is also where every plugin gets switched on and off
while the player is running, which is the fastest way to catch a
plugin that does not clean up after itself.

## The two tools that took three months

Now the awkward part.

When Spine was hired in May, one of her first acts was to
consider creating three new agents and reject all three, with
reasons. That judgement was written up approvingly at the time,
including by me. One of the three she rejected was a coverage
walker, whose job would have been making sure every public
surface in core is actually hit by a button in the testbed.

Her reason was that the testing specialist already covered it,
and that pulling a responsibility out of an existing role to
spawn a new one is how you end up with a roster nobody can
navigate. That reasoning is sound. It is still sound.

It was also, on the specific question of whether the coverage
walker's job would get done, wrong. It did not get done. Not by
the testing specialist, not by anyone, for three months.

What eventually did it was not an agent at all. In July two
headless tools appeared beside the libraries.

The first extracts the contract mechanically from the source. It
reads the event maps and pulls out every event name with its
payload type. It reads the player classes and pulls out every
public method signature. It reads the error surface and pulls out
every error code. Nothing about that is a judgement call, which is
exactly why it should never have been a role.

The second is a behavioural harness. It defines scenarios in a
schema, validates them, and runs them against real video and
music players through a shared backend, so the same scenario can
be asserted against both libraries and any asymmetry shows up as a
failure rather than as a thing somebody notices later. It shipped
with a proof that it can fail, which is the check most harnesses
skip and the one that separates a test suite from a decoration.

## The lesson, which is not a new one

"No, and here is who already owns it" is a good answer to a
staffing question. It is not an answer to an artifact question,
and the coverage walker was an artifact question wearing a
staffing question's clothes.

Ownership tells you who to ask. It does not run on a schedule, it
does not fail a build, and it does not survive a session ending.
A recurring check needs something that executes. Assigning it to
an existing owner feels like closing the item, and it closes
nothing.

Three months is the cost of learning that here. It is the same
lesson this journal has now run into from two completely
different directions, and both times it looked like good
judgement while it was happening.

## What is still not proven

Two honest gaps, because a report that only lists its wins is
marketing.

The contract extractor and the scenario harness are new. They
check that the two players agree with each other and that the
declared surface matches the source. They do not yet check that
the surface is reachable from the testbed, which was the original
coverage walker's actual job. That specific check still does not
exist.

And the promise in part five, that the public API is versioned
and treated seriously while internals are not, is enforced by
review and intent rather than by a tool. There is nothing today
that fails a build when a public signature changes without a
version bump. That is a gap, it is known, and writing it down here
is the cheapest way to stop it being quietly forgotten.
