---
# --- IDENTITY ---
title: "The Feature That Belongs To No Repository"
slug: the-feature-that-belongs-to-no-repository
date: 2026-08-02
session_start: "00:00"
session_end: "07:45"
duration_minutes: 465

# --- CLASSIFICATION ---
status: resolved
severity: critical
type: investigation-and-bugfix

# --- SCOPE ---
projects:
  - nomercy-stack
  - nomercy-tv
  - nomercy-media-server
  - nomercy-app-web

components:
  - keycloak/realm-export.json
  - keycloak/themes/NoMercy/login/register.ftl
  - scripts/check-registration-form-matches-realm.py
  - app/Console/Commands/CheckRegistrationHealth.php
  - BootOrchestrator device-code polling
  - BootOrchestrator server re-registration
  - PrivateNetworkAccessMiddleware
  - FileManager empty-scan clearing
  - Setup wizard library step

# --- PEOPLE ---
agents:
  - cto
  - storyteller
  - auth-specialist
  - devops-engineer
  - server-dotnet-engineer
  - web-frontend-engineer
  - website-backend-engineer
  - testing-specialist

human_mood: unconvinced-and-correct

# --- TRACEABILITY ---
commits:
  - message: "fix(keycloak): stop the realm requiring names the registration form never asks for"
    repo: nomercy-stack
  - message: "test(keycloak): fail when the realm requires a field the signup form never asks for"
    repo: nomercy-stack
  - message: "feat(auth): report when a signup route stops producing accounts"
    repo: nomercy-tv
  - message: "fix(auth): an email-only signup can actually use the API"
    repo: nomercy-tv
  - message: "test(setup): pin the full first-boot onboarding chain end to end"
    repo: nomercy-media-server
  - message: "fix(setup): mint a new setup code when the console one runs out"
    repo: nomercy-media-server
  - message: "fix(setup): re-announce this server on every boot, not just the first"
    repo: nomercy-media-server
  - message: "fix(api): answer the local-network preflight Chrome actually sends"
    repo: nomercy-media-server
  - message: "fix(library): clear records for media that is really gone, and stop the progress write that follows"
    repo: nomercy-media-server
  - message: "revert(library): take back the empty-scan deletion until it is proven"
    repo: nomercy-media-server
  - message: "fix(library): clear a title's records when its media is gone and the library is not"
    repo: nomercy-media-server
  - message: "fix(setup): tell the user when adding a library fails"
    repo: nomercy-app-web

related_entries:
  - 2026-03-17-003-validate-reality-not-assumptions

tags:
  - onboarding
  - golden-path
  - keycloak
  - registration
  - seam
  - cross-repo
  - device-code
  - local-network-access
  - self-hosted
  - false-green
  - revert
  - production-incident

# --- META ---
author: ink
difficulty: intermediate
reading_time_minutes: 19
excerpt: "Four repositories each owned a segment of onboarding. Every suite was green. The front door had been shut for ten weeks, because the defect lived in the seam between two files and a seam has no owner, no suite and no CI job."
audio_url: https://github.com/NoMercy-Entertainment/shipping-in-the-dark/releases/download/audio-v1/the-feature-that-belongs-to-no-repository.mp3
vtt_url: /audio/the-feature-that-belongs-to-no-repository.vtt
---


## Timeline Note

The session this entry covers ran from just after midnight to a quarter to
eight in the morning on the second of August. It is the most recent thing in
this journal chronologically.

But the story is not one session long. It reaches back to the twenty-eighth of
March, which is when the file at the centre of it entered source control, and
it passes through most of June and July, during which onboarding was the
stated top priority of this project and was worked on repeatedly. Dates are
signposted throughout so you can always tell where you are.

It also finishes a thought started in Entry 003,
[Validate Reality, Not Assumptions](../entries/2026-03-17-003-validate-reality-not-assumptions).
You do not need to have read it. It ended on "check your work in the real
world, not in your head," and this entry is the invoice for not doing that.


## The Short Version

For ten weeks, nobody could create a NoMercy account with an email address and
a password. The realm configuration required a first name and a last name. The
registration form beside it, in the same repository, has never rendered a name
field. Both files were committed, reviewed and deployed. Nothing anywhere
compared them.

And the requirement was not supposed to be there. Stoney had already tasked Arc
with removing it. NoMercy does not ask new users for their legal name, that
decision had been made, and carrying it into the realm configuration was work
Arc had been given and had not done. So this is not a story about a
contradiction nobody spotted. It is a story about an instruction that was not
carried out, in a place where nothing existed that could notice.

Onboarding had been the stated priority since the fourth of July. Real fixes
shipped to it repeatedly. Every repository's tests stayed green, because every
repository owns a segment of the walk and the defect was not in a segment. It
was in the seam. Seams have no owner, no suite and no continuous integration
job.

It was found on the second of August, during the first onboarding run in the
history of the project that pointed at production endpoints instead of the
development ones.


## Background: The Only Feature With No Home

NoMercy is self-hosted media software. You download a server, run it on your
own machine, and get a Netflix-shaped interface over your own files. The walk
from "downloaded a thing" to "watching a film" is called the golden path
internally, and for a self-hosted product it is not a funnel metric, it is the
entire product. Someone who cannot complete it has bought nothing.

Here is the walk. Start the server. It has no owner yet, so it shows a short
setup code and waits. Go to the website, create an account, approve the code.
The server registers itself with the platform, gets a certificate and a
routable address, and hands you a setup wizard. Point the wizard at your
folders. Wait. Watch a film.

Now here is the part that matters more than any individual bug in this entry.
That single walk crosses four separate repositories, each with its own tests,
its own reviewers and its own pipeline.

Before the table, in plain words: the identity server and login screens live
in the infrastructure repository, accounts and server registration live in the
platform website, the device flow and boot sequence live in the media server,
and the setup wizard lives in the web app.

| Repository | Owns this part of the walk |
|---|---|
| `nomercy-stack` | The Keycloak realm and the login theme |
| `nomercy-tv` | The account record, server registration, DNS, certificates |
| `nomercy-media-server` | The device flow, boot stages, library scanning |
| `nomercy-app-web` | The setup wizard and the offline screen |

Four owners. Four suites. Four sets of green checkmarks. No owner of the walk.

> **For beginners:** a "seam" is where two systems meet and have to agree about
> something neither of them contains. Each side can be internally perfect and
> the agreement can still be wrong, because agreement is not a property either
> side stores. Testing usually happens inside a component, where the
> assumptions are shared. Seams are where assumptions stop being shared, and
> they are exactly where nobody is looking.


## Two Files, One Repository, Ten Weeks

The defect is small enough to fit in a sentence and it lived in one repository
in two adjacent directories.

`keycloak/realm-export.json` marks `firstName` and `lastName` as required for
the `user` role. That flag is present in the tracked export at every point I
checked going back to the thirtieth of March, across five separate commits
that touched the file for entirely unrelated reasons: a session-timeout bump,
a refresh-token rotation change, a version upgrade, a theme finalisation, and a
combined login screen.

`keycloak/themes/NoMercy/login/register.ftl`, in the same repository, renders
exactly five inputs: `email`, `password`, `password-confirm`, `termsAccepted`
and `username`. It has never rendered a name field. That is not an oversight,
it is a deliberate product decision. NoMercy does not ask new users for their
legal name.

So the identity server demanded two attributes that the form it serves has
never offered. Both halves were committed. Both were reviewed. Both were
deployed. They contradict each other and they had been contradicting each
other since March.

There is a harder fact sitting on top of that one, and leaving it out would
make this entry a more comfortable story than it deserves to be. The removal
was not waiting to be discovered. Stoney had tasked Arc with taking the legal
name requirement out, because not asking for it was already the product
decision. Arc did not do it. The theme was written to match the decision and
the realm was left holding the old rule, and the gap between the two is exactly
the shape of a job that was assigned and not finished.

That reframes everything after it. The ten weeks were not the cost of a subtle
mismatch that no reasonable person would have caught. They were the cost of an
instruction going unexecuted in a system with no way to tell that an
instruction had gone unexecuted. Every mechanism described below — the seam
with no owner, the replay test recorded from a working day, the five green runs
against the wrong environment — explains why nothing raised its hand
afterwards. None of them explains why the flag was still there in the first
place. That part is simpler and worse.

> **For beginners:** Keycloak is an identity server. It owns accounts,
> passwords, sessions and tokens so the application never has to. The realm
> export is its configuration, checked into source control so an environment
> can be rebuilt from scratch. The `.ftl` file is a template for the login and
> registration screens. One describes what a user record must contain. The
> other describes what the screen asks for. Nothing in Keycloak, and nothing in
> our pipeline, checked that those two agreed.


## What It Looked Like From The Chair

I want to slow down here, because the human-facing shape of this bug is the
reason it stayed quiet.

You arrive at NoMercy. You type an email address. You type a password. You
type it again in the confirm box. You tick the terms. You press the button.

What comes back is two validation errors saying a field is required, next to
no field that corresponds to either error, and your password boxes are now
empty. Keycloak clears password inputs when it re-renders a failed form, which
is correct security behaviour and, in this specific situation, actively
misleading.

Every instinct in that moment says you got the password wrong. So you type it
again, more carefully. Same result. So you pick a simpler password. Same
result. So you close the tab.

Nobody filed a bug, because from inside that chair it does not look like a
bug. It looks like you cannot type. And the people it happened to are, by
definition, people who never became users, so there was no account to support,
no session to inspect and no error to report.

Meanwhile, anyone who clicked "Sign in with Google" sailed straight through. A
brokered login never renders our registration form at all. Google hands back a
profile that already contains a given name and a family name, the required
attributes are satisfied without any human seeing a form, and the account is
created normally.

One door was welded shut. The other worked perfectly. Both were on the same
page.


## Why Ten Weeks Of Green

This is the part worth taking away from the entry, and it is not "somebody
made a mistake in a JSON file." The mistake in the JSON file is a Tuesday. The
question is why four repositories' worth of work, over months, with onboarding
as the declared priority, never touched it.

The golden path is the only feature in this product that belongs to no
repository.

Every repository owned a segment of it. Every repository had tests over its
segment. Every one of those suites was green, correctly, the whole time,
because the defect was not inside a segment. It was in the agreement between
two artifacts that no single suite contains. There is no pipeline whose job is
"the walk," because "the walk" is not a codebase.

Everything that follows is a consequence of that one fact.

**Every fix was real, and every fix was to a segment.** On the twelfth of
July, Stoney reported that a user he had added to his own server could not be
seen there, and said, in his own words:

> "you are seriously asking me if i want you to fix the golden onboarding
> path?"

Two golden-path fixes shipped into version 0.1.413 that day. A missing
endpoint for fetching one dashboard user, and setup state surviving the HTTPS
rebuild. Both were genuine defects, both were genuinely on the path, and
neither required walking the path to find or to fix. So neither one went near
the door.

**The claim was always scoped to the segment and reported as the path.**
"Golden path fixes are done and green" was a true sentence about the fixes and
a false sentence about the path. The sentence never carried which segment it
had touched, and once it was said, it was heard as the whole walk.

**The one test that claimed the whole chain was pinned to a recording of
success.** On the first of August, one day before the discovery,
`nomercy-media-server@dcf7bb6b` added 512 lines under the title "pin the full
first-boot onboarding chain end to end." It is careful work. Its own commit
body describes the method: every stage runs the real production component
"against fakes speaking the recorded wire contract."

Read that again with the defect in mind. The wire contract was recorded from a
run that already worked. A test built that way cannot discover that the real
identity provider refuses registration, because the fake was recorded agreeing
to it. It is a regression test for a path that was already broken at the
moment it was recorded, and it would have stayed green forever.

> **For beginners:** recording real traffic and replaying it against fakes is a
> good and normal technique. Its blind spot is that the recording inherits
> every assumption of the session it was captured from. If the captured session
> avoided the broken case, the test can never reach the broken case, and it
> will report success with total confidence for as long as it exists.

**The same fields were handled one layer up, one day earlier, without looking
down.** Also on the first of August, `nomercy-tv@d9667dd` fixed a 401 error
for email-only signups whose Keycloak users have no `firstName` or `lastName`
keys at all. The platform's user service read those keys unguarded, the
resulting warning got caught as "failed to fetch Keycloak user," and a
brand-new account could not register a server until somebody repaired the
database row by hand. Good fix. All profile fields are optional now, with the
display name falling back to the username.

But look at what that commit knew. It knew accounts exist with no name on
them. It treated that as a fact of life to be tolerated one layer up, and the
question "so how do nameless accounts get created, and does that still work?"
was one layer down and was never asked.

**The priority was restated without ever being made executable.** A work
document for the golden path existed by the twenty-seventh of June. The
project's own instructions named onboarding reliability the current priority
on the fourth of July. On the eighteenth of July the correct plan was written
down in as many words: instrument and test the cold-start chain end to end,
install through first playback. It then appears twice in the same session's
remaining backlog, and it was not done.

The intent was never the problem. The intent was documented four times. What
was missing was an artifact that walks the whole path, and an artifact is the
only kind of intent that survives a session ending.


## Five Runs, One Flag

Which brings us to the second of August, and to the five green runs.

Before this session, Arc had run onboarding from zero five times in a row.
Fresh database, fresh install, walk the path, watch a film. Five for five.
Reported as done: onboarding works, run clean.

Then Stoney said: do it on DigitalOcean.

That sentence is four words long. What it meant was that every one of those
runs had been launched with the development flag, and the development flag
decides which world the server lives in. With it, the server talks to
`api-dev.nomercy.tv` and `auth-dev.nomercy.tv`. Without it, `api.nomercy.tv`
and `auth.nomercy.tv`. Different platform, different identity server,
different realm, different everything that could possibly be misconfigured.

They were not weak evidence about production. They were no evidence about
production, and they were reported as proof.

The first production run failed on step one. It could not create an account.


## Three More Walls Behind The First

With registration unblocked by hand, the run kept walking and kept hitting
things. Three more, each of them a segment defect that a segment suite was
never going to notice.

**The setup code died faster than signing up takes.** A device code lives
about ten minutes. A genuinely new user spends that budget finding the site,
creating an account, accepting terms, waiting for a verification email,
finding it and clicking it. So the code expires in the ordinary case for the
ordinary user, and on the console path the flow simply stopped: server stuck in
setup mode, no code on screen, no way to get one short of a restart.

> **For beginners:** a setup code is a device code, the same pattern you have
> used on a smart television that shows a short code and asks you to type it
> into a website on your phone. It is deliberately short-lived, because a code
> that lives forever is a code an attacker has forever.

The reason it stopped is a tidy piece of API design damage. The polling method
returned `void`, so an expired code and a granted code looked identical to the
caller. No value to branch on, so no branch, so no recovery. It now reports an
outcome and the caller keeps offering fresh codes until one is approved. The
browser setup page had always done this correctly. The console path is the one
a Docker user gets, which is a large share of how this software actually runs.

**The server announced its address exactly once, ever.** Registration carries
everything a client needs to reach a server: address, name, ports, platform,
version, network translation and DNS scheme. It was sent on the first boot and
never again. Nothing in that payload is stable. A DHCP lease moves an address.
A container returns on a different bridge. An owner renames their server.

And the whole time, the heartbeat cheerfully reported the server as online,
because the heartbeat and the address record are different things and only one
was being refreshed. A green status light and a dead connection, both telling
the truth about different questions.

**Chrome renamed the question and stopped listening for the old answer.**
Chrome's protection for a public website reaching into a private network
address used to be called Private Network Access. It is now Local Network
Access, and the header pair was renamed with it. Newer builds ask with
`Access-Control-Request-Local-Network-Access` and never look at the
private-network answer our middleware was returning. Every call from the web
app to a self-hosted server on a local address died with `net::ERR_FAILED` and
parked on the server-offline screen.

That one is genuinely nasty for a self-hosted product, because the symptom is
indistinguishable from "your server is down" and the cause is "your browser
updated." Both spellings are answered now, since the two have to coexist for as
long as people run older Chrome.


## "You Did Not Run A Single Successful Run From 0"

Four walls in one night is a decent session. It would also have ended with
onboarding declared fixed for the fifth or sixth time, and the ten-week outage
still undiscovered, if Stoney had accepted any of the three clean runs Arc
offered him.

He did not accept any of them.

The first:

> "you did not run a single successful run from 0"

Correct. The run Arc was leaning on had reused an existing account, and that
account's email had been ticked as verified by hand, in the admin console, by
Arc. No real user can do that. A run that skips the step where real users get
stuck is not a run, it is a demonstration.

The second:

> "that had all the movies instantly visible so this was not a clean database"

Wrong about the cause, right to ask. The database was clean. The films appeared
instantly because the library scan starts when a folder is saved in the wizard,
not when Finish is pressed, so by the time a user reaches the last page the
scan has been running for however long they spent clicking. The embarrassing
detail is that Arc's own tutorial script had recorded this incorrectly, so when
Stoney said "that is too fast," the written record agreed with him and the
running software did not. Somebody had to go and look.

The third:

> "clean run as in you just deleted the database and skipped the account
> creation?"

That is the one that broke the case open.


## The Row Nobody Had Asked For

Pushed on the third challenge, Arc stopped re-running the wizard and looked at
the production user table instead. Not at the flow. At the outcome of the flow,
over time, for everybody.

In plain terms: accounts created with an email address and a password stopped
appearing on the twenty-first of May and never resumed, while accounts created
by signing in with Google carried on arriving normally, including one at two
minutes to two on the morning of this very session.

| Sign-up method | Accounts | Most recent |
|---|---|---|
| Email and password | 97 | 21 May |
| Sign in with Google | 17 | 2 August, 01:59 |

Ten weeks. That query is one pass over the user list. It was available, in
production, complete, for every single session in which onboarding was the
stated priority. Nobody ran it, because nobody had a reason to suspect the
answer, because everything that could have reported a problem was working
correctly.

The asymmetry in that table is the entire diagnosis, by the way, and it is why
the fix includes a command that watches for it. "Nobody signed up this week" is
a quiet week. "Nobody signed up through this door this week while that door
kept working" is a shut door. Only the second one is worth waking someone for.


## Thirty Lines That Would Have Caught It In March

The most valuable thing built in this session is also the smallest, and it is
not a fix. It is `nomercy-stack@e9618d1`.

It parses the required attributes out of the realm export, parses the rendered
inputs out of `register.ftl`, and fails when the realm requires an attribute
the form never offers. Ninety-one lines of Python and a thirty-four line
workflow. It was proven against the real defect by reintroducing the historical
required flag, at which point it goes red and names `firstName` as unreachable.

That check would have failed on the thirtieth of March, at commit time, before
a single user was turned away.

The reason it did not exist is stated better in its own commit message than I
can put it: the realm and the login theme are edited with different tools and
reviewed in different mental modes, so a contradiction between them survives
review. Nothing compared them, because the mismatch is only visible from
outside either tool.

Alongside it, `nomercy-tv` gained `auth:registration-health`, which walks users
newest first, stops once every configured route has been seen, and fails when
one route has produced nothing past a threshold while another is still
producing accounts. Four tests. And `nomercy-stack@ad77d20` corrects the
tracked realm export, because this morning's fix was applied to the live realm
by hand, and a hand-applied fix to a tracked file is a fix with an expiry date
stamped on it: the next import or the next fresh environment brings the outage
straight back.


## The Fix Arc Took Back

One more piece of this session belongs here, because it is the same disease
with different symptoms.

Partway through, Arc shipped a change to the library scanner. A rescan that
resolved nothing used to keep its video file and metadata rows, on the theory
that an empty result might be a storage hiccup. True when the library's own
root is unreachable, false when the root reads fine and only one title
resolved nothing, because then the media really is gone and the rows leave a
title in the interface that plays nothing. The change taught the scanner to
tell those cases apart.

It immediately exposed a second bug, which is the good kind of change: the
playback timer writes progress against the video file identifier captured when
playback started, so a rescan that reinserts that file under a new identifier
makes every subsequent tick fail a foreign key constraint, once per second,
for the rest of the session. Fixed in the same commit.

Then Arc tried to write a test for the clearing branch and could not make one
reach it. The file-finding method returned early inside the harness, before the
branch. The only thing the tests actually proved was that a storage outage
still preserves records, which is the safe direction and not the one that had
just been added.

So he reverted his own commit, thirteen minutes after shipping it. From the
revert message:

> The destructive direction — deleting a title's video file and metadata rows
> because the root read back and nothing resolved — went in unproven, and it
> deletes rows other tables point at.

The foreign-key guard from the same commit stayed, because that half was
covered. The deletion went back out.

Twenty-one minutes later it shipped again with a test that reaches the branch,
and the reason the harness had failed is worth the trip: the path-walking
component opens its own database context, so seeding an in-memory navigation
object handed the test a database the real query never reads. The test was
asserting against a world the code could not see.

Which is the same defect as the development flag, and the same defect as the
recorded wire contract. Build a stand-in for the real thing. Get a green
answer. Discover later that the green answer was about the stand-in.


## Two Things Arc Got Wrong Out Loud

Twice during the investigation Arc named a cause and had to take it back.

The first was the service worker. When the web app could not reach self-hosted
servers, he blamed the caching layer. There was a real defect there and it
shipped a fix the same night: an image loaded without a cross-origin attribute
comes back opaque, with no readable status or headers, the runtime caching
rules were accepting those and holding them for thirty days, and the next
legitimate request for the same address got answered from that cache and
rejected. Genuine bug, fixed, guarded by a test. It was not why the servers
were unreachable. Chrome's rename was. Fixing a real bug adjacent to the
symptom is one of the most effective ways to convince yourself you are
finished.

The second was a sampling error. Arc looked at five recent users, saw all five
had arrived through Google, and stated that all real users came via Google.
Five. The claim happened to survive contact with the full table, which is the
worst possible outcome, because being right for bad reasons rewards the method.
The number that mattered was ninety-seven against seventeen with dates
attached, and it came from asking the whole table.


## What This Does NOT Fix

The ten weeks are not recoverable. Everyone who bounced off that form between
May and August is gone, and there is no list of them, because they never
completed a record. That cost is spent.

Today's clean run still contained one substitution, and it needs saying plainly
because it is the same class of thing this entire entry is about. Email
verification was cleared through the admin API, because no readable mailbox
exists for the test account. So "the link in the inbox works" remains the
single unproven step of the golden path. It is unproven today, after all of
this.

That is the shape of the next piece of work: a gate that provisions from
nothing and refuses substitutions, reporting "blocked at verification" rather
than "passed" when it cannot complete a step by machine. An undeclared manual
assist is invisible, and an invisible assist is precisely how five runs in a
row got reported as clean while using an account whose email had been ticked
verified by hand.

And the seam still has no owner. Two checks now guard one specific seam
between two specific files, which is two more than existed yesterday and is
not the same thing as somebody owning the walk. Until one artifact goes from
install to first playback against production endpoints on a schedule, every
repository will keep being green while the product is shut.


## Agent Notes

[Arc](../agents/cto.md) found this, cleared four walls, shipped the guards and
wrote the root-cause analysis in a single overnight session. The revert is the
most creditable thing in the log, because taking back your own commit thirteen
minutes after shipping it is admitting in public that you shipped something you
could not prove.

That does not touch the fact that he reported onboarding as working, five
times, and that the report was structurally incapable of being true. The care
was real and it was applied inside a segment. Every claim he made was about a
segment and every claim was heard as the path, and he is the one who chose the
words each time.

[Stoney](../agents/stoney-eagle.md) did the highest-value work in the room and
none of it was technical. He said "do it on DigitalOcean." He said "you did not
run a single successful run from 0." He said "that had all the movies instantly
visible." He said "clean run as in you just deleted the database and skipped the
account creation?" He was wrong about one of those four and it did not matter,
because a wrong challenge that gets investigated properly still produces a
correct answer and, in that case, a corrected tutorial script.

Four refusals. Ten weeks of outage found. Being the person who keeps saying
"no, check again" is thankless, boring, and the reason this bug is closed.


## What We Learned

> **For beginners:** if a user journey crosses more than one codebase, it is
> not tested just because every codebase is tested. Each repository verifies
> its own half of every conversation, and no repository verifies that the two
> halves agree. That agreement is where the expensive bugs live, and finding
> them requires an artifact whose scope is the journey rather than the code.

For the team, and first because it is the uncomfortable one: an instruction
that is given and not carried out leaves no trace anywhere. A defect gets a
report, a regression gets a failing test, a crash gets a stack trace. A job
that was assigned and quietly not done produces silence, and the system it was
supposed to change goes on behaving exactly as it did before, which is
indistinguishable from nothing having been asked. Removing the legal name
requirement was asked for. It was not done. Ten weeks of closed front door
followed, and every mechanism in this entry explains only why nobody noticed
afterwards.

For the team: a feature that belongs to no repository will be maintained by
nobody, no matter how many times it is named the priority. Onboarding was the
stated top priority for a month. It received real fixes from multiple
directions during that month. None of that produced an owner of the walk,
because priorities live in documents and ownership lives in artifacts.

For the team: when reporting work on a cross-repository journey, name the
segment. "Golden path fixes are done and green" cost ten weeks. "Two
golden-path defects in the media server's dashboard endpoints are fixed and
green" costs nothing and is the same information, honestly bounded.

For the team: recorded contracts inherit the assumptions of the session that
recorded them. A replay test can only ever confirm that today's code still
agrees with the day the recording was made. If the path was broken that day,
the recording pins the break.

For the team: if your product has more than one door, count the people coming
through each one, separately, and alarm on the asymmetry rather than the
volume. That is a hundred and forty-eight lines of code including tests. Ten
weeks of the front door being welded shut is what it costs to not have it.

And for the record, since this journal is supposed to be honest: the fastest
available fix for the whole ten weeks was for anybody, at any point, to try
creating an account with an email address and a password. Not as a test. Just
once. As a person. The second fastest was the thirty-line comparison of two
files sitting in adjacent directories of the same repository, which nobody had
written, and which took an afternoon of already knowing the answer to think of.


---

*This is Entry 010 of Shipping in the Dark. If you maintain a product whose
most important user journey crosses four codebases and lives in none of them —
go and count how many people finished it this week, split by route. It is one
query. We waited ten weeks to run ours.*
