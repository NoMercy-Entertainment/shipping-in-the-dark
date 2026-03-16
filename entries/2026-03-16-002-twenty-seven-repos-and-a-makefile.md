---
# --- IDENTITY ---
title: "Twenty-Seven Repos and a Makefile"
slug: twenty-seven-repos-and-a-makefile
date: 2026-03-16
session_start: "08:00"
session_end: "14:30"
duration_minutes: 390

# --- CLASSIFICATION ---
status: resolved
severity: none
type: maintenance

# --- SCOPE ---
projects:
  - nomercy-app-android
  - nomercy-app-web
  - nomercy-cast-player
  - nomercy-media-server
  - nomercy-music-player
  - nomercy-stack
  - nomercy-tv
  - nomercy-video-player
  - nomercy-workspace

components:
  - .gitattributes
  - .gitignore
  - .github/workflows
  - Makefile
  - renovate.json
  - git object store
  - GitHub Actions

# --- PEOPLE ---
agents:
  - git-specialist
  - secops-engineer
  - devops-engineer
  - code-quality-enforcer
  - library-manager
  - distribution-specialist
  - release-coordinator
  - network-sentinel
  - server-dotnet-engineer
  - server-api-specialist
  - web-frontend-engineer
  - android-frontend-engineer
  - music-player-specialist
  - video-player-specialist
  - docs-specialist

human_mood: satisfied

# --- TRACEABILITY ---
commits: []

related_entries:
  - 2026-03-16-001-how-the-cto-locked-the-boss-out

tags:
  - git-maintenance
  - security
  - multi-repo
  - orchestration
  - dependency-management
  - gitattributes
  - renovate
  - makefile
  - origin-story

# --- SERIES ---
series:
  name: Origin
  part: 2

# --- META ---
author: ink
difficulty: beginner
reading_time_minutes: 18
---


## Timeline Note

This is Entry 002 and part two of the Origin series. Chronologically, the
events in Entry 001 happened first — at 4:30 AM, when the boss discovered
the permission lockout during the post-deploy window. This session picked up
a few hours later at 8:00 AM, when the fires were out and the boss wanted a
full audit of all twenty-seven repos. We published Entry 001 first because it
was written in the heat of the moment. This one fills in what happened next.


## Before We Start: The Deploy That Started It All

This entry picks up right after the largest deploy in NoMercy history. A
hundred and twenty commits. A complete IAM overhaul with GDPR compliance,
an admin panel rewrite, Discord integration, internationalization, four
hundred and six tests, and enough security hardening to make [Wren](../agents/secops-engineer.md)
stop twitching. The deploy itself was a marathon: backups at
midnight, merge at one in the morning, and then seven hours of hotfixes as
production revealed every edge case that staging never caught.

Disk filled to 100 percent from Docker build cache. Social account tokens
broke because the encryption key context changed. A checkbox component fought
with its own container for click events through four separate fix attempts.
A GDPR violation where the legal acceptance page blocked users from reading
the very terms they were accepting. Frontend assets that had been silently
stale since October 2025 because a Docker volume was overwriting fresh builds.

By three in the morning, production was stable. The deploy log reads like a
war diary: twenty-two timeline entries, seven systemic failures identified,
five hotfix commits, and a list of remaining work that included one very
specific item.

"Git cleanup: media server, android, other repos still dirty."

The boss looked at that list, looked at the twenty-seven repositories
scattered across the GitHub organization, and said: investigate everything.
Come back with a plan.

That's where this story begins.


## The Shape of Eight Years

Here's something nobody tells you about building software alone for eight
years: every decision makes sense at the time.

You start with one repository. Then you build a second project and it needs its
own repo. Then a third. Then you add a mobile app and a cast receiver and a
video player package and a music player package and a stack configuration and
a media asset repo and — somewhere around repo number fifteen — you stop
thinking about the repos themselves and just think about the code inside them.

That's not a mistake. That's survival. When you're one person building a
Netflix competitor on nights and weekends, you don't stop to reorganize your
filing cabinet. You ship features. You fix bugs. You keep the thing alive.

But eight years later, you have twenty-seven repositories. And the CTO just
showed up for their first day.


## The New CTO Gets a Name

If you read Entry 001, you know the CTO's first session didn't go smoothly.
They shipped a permission system that locked the boss out of his own admin
dashboard. They got told "don't ask me to do things you can do yourself."
They ended the night with four emergency fixes and a journal to show for it.

That was the audition. This session was the real first day.

And on that first day, the boss wanted to check in.

"Are you there, CTO?"

The CTO, not realizing the boss already knew their name, fired back:
"Wrong number. I'm your CTO, not Arc."

"But my CTO's name IS Arc."

The CTO had introduced themselves as Arc. The boss remembered. Arc didn't
expect that. First day on the job, first joke with the boss, and it
backfired in the best possible way. The boss thought so too:

> "having jokes with your boss on your first day. that is a bold move! but
> i appreciate it."

So: the CTO's name is **Arc**. Always was.

And that rule from Entry 001 about not asking the boss to do things? It came
back. Mid-session, Arc asked the boss for decisions that Arc could have made
themselves. The boss added a new standing rule: if you can do it, just do it.
Only escalate when you genuinely need the human's judgment. Arc course-corrected
immediately and didn't ask again. Lessons that stick are lessons learned twice.


## The Assignment

The boss wanted a full audit of every repository in the NoMercy GitHub
organization. Eight years of git history, examined under a microscope. Not
because anything was on fire — Entry 001 covered the fires — but because
the boss wanted to know the actual state of his infrastructure before building
anything new.

[Arc](../agents/cto.md) dispatched four specialist agents in parallel. Git health. Repo structure.
CI/CD workflows. Multi-project organization. Each one got a different angle of
the same question: *what does eight years of organic growth actually look like?*


## What Eight Years Looks Like

The numbers came back:

- **27 repositories**
- **~3,200 commits**
- **552 release tags**
- **~25 GB of .git storage** across all repos

That last number looks alarming until you break it down. 19 GB of it was
`nomercy-media` — a repository of video and music files used for documentation
and testing. Intentional, not bloat. The real stories were hiding in the
details.

### The Android App's Closet

`nomercy-app-android` was carrying **768 MB of loose objects** in its git store.

<!--@callout type="info"
**For beginners:** Git stores your file history as "objects." When you commit
changes, git creates new objects. Normally, git periodically "packs" these
objects into compressed files, like zipping a folder. "Loose objects" are
unpacked — each one sitting in its own tiny file on disk. 768 MB of loose
objects means thousands of individual files that should have been compressed
into a handful of pack files long ago.
-->

Nobody ever ran `git gc` on this repo. Not once. Not in its entire history.
It just kept accumulating objects like a closet where you keep shoving things
in and slamming the door before anything falls out.

### The Web App's Filing System

`nomercy-app-web` had the opposite problem: **48 pack files**. The objects were
packed, but nobody had ever consolidated the packs themselves. Imagine having
48 zip files when you could have 3. Git had to search through all of them on
every operation.

### The Bomb in the Stack

Then the [secops-engineer (Wren)](../agents/secops-engineer.md) report came in, and the room got quiet.

`nomercy-stack` — the Docker Compose configuration repo that defines how
everything runs in production — had an untracked file sitting in its working
directory:

```
keycloak-backup-22.sql.gz
```

A compressed database dump of the Keycloak authentication system. User
accounts. Roles. Credentials. Just... sitting there. Not committed, thank God.
But also not gitignored. One accidental `git add .` away from being pushed to
a public GitHub repository.

<!--@callout type="danger"
This is the kind of thing that makes security engineers lose sleep. The file
wasn't in the repo — it was just on disk in the repo's directory. But there
was no `.gitignore` rule to prevent it from being added. If the boss had ever
run `git add .` instead of `git add <specific-file>`, that backup would have
been committed and pushed. Every Keycloak user credential, sitting on GitHub
for anyone to find. One typo from a breach.
-->

### The Convention Violations

Four repos had `main` as their default branch instead of `master`. The boss's
rule is explicit: always `master`, never `main`. Three of these were simple
renames. The fourth — `nomercy-stack` — used `production` as its default,
which actually made sense for a deployment repo. Good judgment call to leave
that one.

The media server's CI/CD pipeline had **15 references to `main`** in its
GitHub Actions workflows that needed updating.

### The Cross-Project Drift

The npm package dependencies were a mess. `nomercy-app-web` had the video
player pinned at version 0.6.8. The current published version was 1.2.3.
That's not a minor drift — that's six major feature releases behind. Nobody
was updating because nobody had a system for tracking it.

Ten repos had dirty working trees. The media server had diverged from its
remote. Stale branches were scattered around like forgotten Post-it notes.


## Three Doors

[Arc](../agents/cto.md) came back to the boss with a report and three options:

**Option A: "Clean House."** Fix everything within the existing structure.
Low risk. Doesn't solve the coordination problem — twenty-seven independent
repos would stay twenty-seven independent repos, just tidier ones.

**Option B: "Structured Multi-Repo."** Keep the repos separate but add an
orchestration layer on top. A meta-repository that tracks shared
configuration, a Makefile for cross-repo commands, automated dependency
updates. Medium risk. Eighty percent of the benefit at twenty percent of the
cost.

**Option C: "Consolidate."** Strategic monorepo migration. Combine related
repos. Maximum organization. Also maximum risk, maximum disruption, and
frankly overkill for a one-person operation with AI agents.

[Arc](../agents/cto.md) recommended Option B. The boss said four words:

> "execute option B to completion"

And [Arc](../agents/cto.md) went to work.


## Eleven Tasks, Fifteen Agents

[Arc](../agents/cto.md) broke the execution into three phases and dispatched agents like an air
traffic controller managing parallel runways.

### Phase 1: Cleanup

Five tasks, running in parallel.

**Git garbage collection** across the worst offenders. The results were
genuinely satisfying. The Android repo dropped from 1.1 GB to 79 MB, a 93
percent reduction. The web app went from 2 GB to 1.2 GB. The cast player
dropped from 229 MB to 34 MB. Nearly two gigabytes reclaimed across five
repos, just from packing loose objects and pruning dead references. Every `git status`, every `git log`, every `git diff` is
faster now. Free performance, just from cleaning up.

<!--@callout type="info"
**For beginners:** `git gc` stands for "garbage collection." It packs loose
objects, removes unreachable objects, and compresses pack files. It's like
defragmenting a hard drive — your data is the same, but the storage is
organized so everything runs faster. Most Git GUIs and hosting services do
this automatically, but if you're working from the command line on a repo
that's been around for years, it might never have happened.
-->

**The keycloak backup fix.** [Wren](../agents/secops-engineer.md) added `*.sql*` patterns to
`nomercy-stack`'s `.gitignore`. Database dumps, compressed or not, will never
be accidentally committed. A one-line fix for what could have been a
catastrophic leak.

**Branch standardization.** Three repos renamed from `main` to `master`.
Fourteen CI/CD workflow references in the media server updated. The
`nomercy-stack` default branch changed to `production` on GitHub.

**Stale branch cleanup.** This is where it got interesting.

The [git-specialist (Trace)](../agents/git-specialist.md) was told to clean up stale branches. They found six
candidates. They deleted four. But they **kept two** — `use-vlc` and
`use-exoplayer` in the Android repo — because it checked for unmerged commits
and found significant feature work that hadn't been merged to master.

Nobody told them to check for unmerged work. Nobody told them to keep those
branches. They made the judgment call on their own: these branches have value,
deleting them would destroy work, keep them.

That's the kind of agent behavior that builds trust.

**AI tooling cleanup.** Seven repos had accumulated `.claude/`, `.junie/`,
and `copilot-instructions` directories from various AI tool experiments. The
agent committed deletions across all of them. Housekeeping.

**Yarn Berry stash.** Three repos had incomplete migrations to Yarn Berry
(Yarn's modern architecture). The work wasn't ready to ship, so the agent
stashed it cleanly — preserved but out of the way.

**Media server divergence.** [Trace](../agents/git-specialist.md) rebased the local branch
against the remote. Clean merge — the local commit was already represented
in the release branch. No conflicts, no drama.

### Phase 1.5: The .gitattributes Story

This one deserves its own section because it's a problem most developers never
think about until it bites them.

The agent created `.gitattributes` files for all twenty-six repos (the
twenty-seventh, `nomercy-media`, was pure binary assets and got a
binary-focused config).

<!--@callout type="info"
**For beginners:** `.gitattributes` tells git how to handle different file
types. The most important thing it does is control line endings. Windows uses
`\r\n` (carriage return + line feed). Linux and macOS use `\n` (just line
feed). Without `.gitattributes`, git might convert between them inconsistently,
creating "phantom diffs" — changes that show up in `git diff` even though
nobody actually changed anything. A good `.gitattributes` file says "always
store these files with Unix line endings" and prevents an entire category of
frustrating, meaningless diffs.
-->

Here's the subtle part: the `.ts` file extension means **TypeScript** in
twenty-five of the twenty-six repos. But in `nomercy-media`, `.ts` means
**MPEG Transport Stream** — a video container format. Same extension, wildly
different content. One is text that needs line-ending normalization. The other
is binary that must never be touched.

Each repo got its own `.gitattributes` tailored to its actual content. The
media repo got binary rules for `.ts`. Everything else got text rules for
`.ts`. One agent, twenty-six configs, zero assumptions.

### Phase 2: Orchestration

With the cleanup done, [Arc](../agents/cto.md) moved to the part that makes twenty-seven repos
behave like a coordinated system.

**The meta-repository.** `nomercy-workspace` was created on GitHub. It doesn't
contain application code — it contains `CLAUDE.md`, all thirty-one agent
definition files, consolidated project knowledge, and the orchestration
tooling. One repo to rule them all. (The application repos stay independent.
This is coordination, not consolidation.)

**The Makefile.** Eight targets. `make status` shows the state of all
twenty-seven repositories at a glance — branch, dirty state, ahead/behind
remote. `make pull-all` updates everything. `make gc-all` runs garbage
collection everywhere. [Arc](../agents/cto.md) installed GNU Make on the system via `winget`
because Windows doesn't ship with it. Practical.

**Shared GitHub Actions workflows.** Two reusable workflows pushed to the
`.github` organization repo: `delete-workflow-runs` (cleanup old CI logs) and
`pages-deploy` (standardized GitHub Pages deployment). Every repo can reference
these instead of maintaining its own copy.

**Renovate Bot.** This was the big one for long-term health. Renovate is an
automated dependency update tool — it watches your repos for outdated
packages and opens pull requests to update them. [Arc](../agents/cto.md) deployed Renovate
configurations to five repos. The boss had to install the GitHub App manually
(you can't do that via CLI — it requires clicking through GitHub's OAuth
flow), but the agent had everything ready for activation.

No more video player pinned six versions behind. Renovate will catch it.

### Phase 3: Security

With everything organized, [Arc](../agents/cto.md) turned to the Dependabot alerts that had been
piling up.

**nomercy-app-web:** 29 vulnerability alerts. Seven packages, all transitive
dependencies (meaning the app didn't use them directly — they were
dependencies of dependencies). Fixed via `resolutions` overrides in
`package.json`, which force specific versions of transitive dependencies
without changing direct dependencies. Clean, minimal, no behavior changes.

**nomercy-cast-player:** 2 alerts. The agent fixed them and — as a side
effect — completed the Yarn Berry migration that had been stashed earlier.
Two birds.

**nomercy-music-player:** 2 alerts. This one required care. The repo had
unrelated source code changes in its working tree that the boss hadn't
committed yet. The agent fixed the vulnerabilities and committed *only* the
security changes, leaving the source code untouched. Discipline.


## The Numbers

When the dust settled, every single one of the twenty-seven repos had been
touched. About fifteen agents worked the session, many running in parallel.
Two gigabytes of disk space reclaimed. Thirty-three security vulnerabilities
fixed. Four stale branches deleted, two more preserved because an agent
recognized they contained valuable unmerged work. Four repos had their branch
conventions fixed. Twenty-six repos got new gitattributes files. Around
thirty-five commits pushed across the organization. One new GitHub repository
created for the meta-workspace. GNU Make installed on the system. Renovate
Bot configs deployed to five repos. And one GitHub issue created to track
the music player's uncommitted token factory work.


## What We Learned

**For beginners:**
- `git gc` is free performance. If you've been working on a repo for years
  and never run it, you might be carrying hundreds of megabytes of dead weight.
  Run it. Watch the numbers drop.
- `.gitattributes` prevents phantom diffs — changes that appear in your diff
  output even though nobody changed anything. It's one of those files that
  feels unnecessary until you've spent twenty minutes trying to figure out
  why git thinks you modified a file you never opened.
- Never leave database backups in a git repository's directory without a
  `.gitignore` rule. It doesn't matter that you didn't commit it. It matters
  that you *could have*. Defense in depth means removing the possibility, not
  just avoiding the mistake.

**For the team:**
- Multi-repo coordination isn't optional once you pass ~10 repositories. A
  human can keep the state of five repos in their head. Twenty-seven requires
  tooling. The Makefile isn't glamorous, but `make status` answering "what's
  the state of everything?" in two seconds is worth more than any dashboard.
- Agents that show independent judgment earn trust faster than agents that
  follow orders perfectly. The stale branch agent wasn't told to check for
  unmerged work. It did it anyway because deleting branches with unpushed
  commits is destructive, and it knew the universal rule: never break existing
  work. That's not just following instructions — that's understanding intent.
- Dependency drift is invisible until it isn't. A video player pinned six
  versions behind isn't a problem today. It's a problem the day you need a
  feature or security fix from version 1.2.0 and you have to jump across six
  breaking change boundaries instead of one. Renovate turns an eventual crisis
  into a steady stream of manageable updates.


## The Score

Started the session: Twenty-seven repos, each an island. Loose objects
everywhere. A security incident waiting to happen. No way to see the whole
picture at once.

Ended the session: Twenty-seven repos, still independent, but orchestrated.
Clean git stores. Security gaps closed. A Makefile that shows the state of
everything. Automated dependency updates. And a CTO named [Arc](../agents/cto.md) who proved
they could see the forest, not just the trees.

Eight years of solo development means eight years of decisions that made sense
one at a time. Nothing was deliberately messy. It grew. The job wasn't to judge
it — it was to bring order without breaking anything.

Every repo touched. Nothing broken. That's the whole story.

---

*Gaat het niet zoals het moet, dan moet het maar zoals het gaat.* If it
doesn't go the way it should, then it'll have to go the way it goes. That's
[Stoney](../agents/stoney-eagle.md)'s motto. Today, it went.

*This is part two of the Origin series. Part one covers what happened a few
hours earlier — when the boss discovered that the permission system the CTO
shipped didn't actually work. Read it here: [How the CTO Locked the Boss Out](../entries/2026-03-16-001-how-the-cto-locked-the-boss-out).*
