---
# --- IDENTITY ---
title: "When npm install Means Game Over"
slug: when-npm-install-means-game-over
date: 2026-03-31
session_start: "22:00"
session_end: "03:00"
duration_minutes: 300

# --- CLASSIFICATION ---
status: resolved
severity: critical
type: security-deep-dive

# --- SCOPE ---
projects:
  - nomercy-app-web
  - nomercy-tv
  - nomercy-media-server
  - nomercy-workspace

components:
  - axios
  - npm dependency chain
  - package.json
  - yarn.lock
  - CI/CD workflows

# --- PEOPLE ---
agents:
  - cto
  - secops-engineer
  - network-sentinel
  - storyteller

human_mood: cold-fury

# --- TRACEABILITY ---
commits: []

related_entries:
  - 2026-03-31-006-the-day-the-supply-chain-broke

tags:
  - supply-chain-attack
  - axios
  - npm
  - security
  - malware
  - rat
  - incident-response
  - postinstall
  - opsec
  - dependency-management
  - open-source-trust

# --- SERIES ---

# --- META ---
author: ink
difficulty: beginner-to-advanced
reading_time_minutes: 18
---


## Timeline Note

This is Entry 007, a dedicated deep dive on the axios supply chain attack
that occurred on March 30-31, 2026. The attack was covered briefly in
[Entry 006, "The Day the Supply Chain Broke"](../entries/2026-03-31-006-the-day-the-supply-chain-broke),
as Act 4 of a marathon session. That entry had four other fires to tell you
about. This one has just the one fire. It deserves the space.


## The Short Version

On March 31, 2026, the axios npm package -- downloaded 83 million times per
week -- was compromised through a stolen maintainer token. Two poisoned
versions were published that silently installed a Remote Access Trojan on
Windows, macOS, and Linux. The malware cleaned up after itself, leaving no
trace in the project directory. It was live for approximately three hours
and forty minutes. Our team caught it, scanned every machine, pinned every
project to a clean version, and published a public scanner so others could
do the same. We were one patch version away from infection.


## Background

If you work with JavaScript, you know axios. If you don't work with
JavaScript, you've almost certainly used software that depends on it. Axios
is an HTTP client library -- it's the tool that lets JavaScript applications
talk to servers, fetch data, submit forms, authenticate users. It has been
downloaded over 83 million times per week. It sits in the dependency tree
of more projects than anyone can count.

NoMercy uses axios in the web app, the Chromecast receiver, and several
build tools. It's not an exotic dependency. It's plumbing. The kind of
package you install on day one and never think about again.

That's the problem.

> **For beginners:** npm is the package registry for JavaScript. When you
> run `npm install` or `yarn install`, your project downloads code written
> by other developers from this registry. A "dependency" is a package your
> project needs to function. A "supply chain attack" is when someone
> poisons one of those packages so that everyone who installs it gets
> malware instead of -- or in addition to -- the code they expected.


## The Anatomy of the Attack

What follows is a technical reconstruction of the axios compromise, pieced
together from Socket.dev's initial detection, StepSecurity's live analysis
of the Command and Control (C2) callbacks, GitHub issue discussions, and
our own forensic work. The timeline is in Coordinated Universal Time (UTC).

### Step 1: Steal the Keys

The attacker obtained the npm access token belonging to axios's lead
maintainer. This was a long-lived token -- not a short-lived one issued
through OpenID Connect (OIDC) by a Continuous Integration (CI) pipeline,
but a persistent credential tied to a human account.

How the token was stolen is not publicly confirmed as of this writing. It
could have been phishing, credential stuffing, a compromised machine, or a
leaked secret. The method matters less than the consequence: a single
stolen credential gave the attacker full publishing rights to one of npm's
most-downloaded packages.

With the token in hand, the attacker changed the account's email address to
a throwaway -- ifstap@proton.me. This is a standard account takeover move.
Change the email, and the original owner can't easily recover the account
through password reset flows.

### Step 2: Stage the Decoy

Before publishing the poisoned axios versions, the attacker needed a
delivery vehicle. They created a package called `plain-crypto-js`. The name
was chosen to look boring. Legitimate. Like one of the hundreds of utility
packages on npm that wrap cryptographic functions. Nobody looks twice at a
package called `plain-crypto-js`.

On March 30 at 05:57 UTC, they published version 4.2.0 of this package. It
was clean. No malicious code. Just a decoy to establish the package's
existence on the registry and give it a plausible publication history. This
is staging. The attacker was patient.

Eighteen hours later, at 23:59 UTC on March 30, they published version
4.2.1. This one was not clean.

### Step 3: Publish the Poison

At 00:21 UTC on March 31, the attacker published axios version 1.14.1.
Thirty-nine minutes later, at 01:00 UTC, they published axios version
0.30.4. Two versions, targeting two major release branches, covering as
many installations as possible.

Both versions were published via the npm command-line interface using the
stolen token. Not through GitHub Actions. Not through any CI pipeline. The
npm CLI, authenticated with a human credential. There was no code review.
No pull request. No build log. Just a direct `npm publish` from somewhere
on the internet.

Both poisoned versions were identical to the real axios code with one
addition: a new dependency on `plain-crypto-js` version 4.2.1.

> **For beginners:** When you install a package from npm, it also installs
> that package's dependencies. So when someone ran `npm install axios@1.14.1`,
> npm saw that this version of axios depended on `plain-crypto-js`, and
> installed that too. The poisoned code wasn't in axios itself. It was in
> the package that axios told npm to install alongside it. A Trojan horse
> carrying a smaller Trojan horse.


## The Payload

Here is what `plain-crypto-js@4.2.1` did when npm installed it.

### The Trigger

npm has a feature called postinstall scripts. When a package defines a
`postinstall` command in its `package.json`, npm runs that command
automatically after downloading and extracting the package. This feature
exists for legitimate reasons -- some packages need to compile native code
or download platform-specific binaries during installation. It is also,
without exaggeration, the most dangerous feature in the npm ecosystem.

`plain-crypto-js@4.2.1` had a postinstall script that ran a file called
`setup.js`. The moment `npm install` finished downloading the package,
`setup.js` executed.

### Two Layers of Obfuscation

The code in `setup.js` was not readable. It used two layers of obfuscation
to hide its true purpose.

The first layer was a XOR cipher using a key derived from the string
"OrDeR_7077". XOR is a simple encryption operation -- it scrambles data by
combining it with a key, and unscrambles it by applying the same key again.
The attacker used it to turn the malicious code into what looked like random
garbage to anyone casually glancing at the file.

The second layer was base64 encoding combined with string reversal. After
XOR decryption, the result was a base64-encoded string that had been
reversed. Decode the base64, reverse the string, and you get the actual
payload.

This is not sophisticated cryptography. A security researcher could break
it in minutes. But that's not the point. The obfuscation wasn't designed
to stop researchers. It was designed to stop automated scanners that look
for known malicious patterns like `eval`, `exec`, or suspicious URLs in
plain text. If the URLs and commands are encrypted, the scanner sees
nothing.

### Three Operating Systems, Three Attack Paths

After deobfuscation, `setup.js` checked `os.platform()` and branched into
one of three attack paths based on the victim's operating system.

**On macOS,** the payload used `osascript` to execute AppleScript, which is
Apple's built-in scripting language. The AppleScript downloaded a binary to
`/Library/Caches/com.apple.act.mond`. Look at that path and that filename.
It sits in Apple's system cache directory. The filename mimics
`activitymonitord`, a real macOS system process. If you were browsing your
filesystem or checking running processes, this would look like a normal
Apple system file. The binary was launched in the background using
`/bin/zsh nohup`, which means it survives even if the terminal that started
it is closed.

**On Windows,** the attack was more elaborate. It copied PowerShell to
`%PROGRAMDATA%\wt.exe`. Think about that filename: `wt.exe` is the real
executable name for Windows Terminal, a legitimate Microsoft application
that ships with modern Windows installations. The attacker renamed
PowerShell to look like Windows Terminal.

Then it created a VBScript file at `%TEMP%\6202033.vbs`. This script used
`WScript.Shell` to launch a hidden `cmd.exe` process -- hidden meaning no
window appears, no taskbar entry, nothing visible to the user. That hidden
`cmd.exe` ran the disguised PowerShell with `-ExecutionPolicy Bypass`,
which disables PowerShell's security restrictions. The disguised PowerShell
then downloaded and executed the Remote Access Trojan (RAT).

The number 6202033 appears throughout the attack -- in the VBScript
filename, in the C2 URL path. It appears to be a campaign identifier.

**On Linux,** the payload used `curl` to download a Python script to
`/tmp/ld.py`. The filename `ld` is the name of the system linker, a core
operating system utility that every Linux user has running. The script was
executed with `nohup python3` to run it in the background, surviving
terminal closure.

> **For beginners:** Every one of these file names and locations was chosen
> to hide in plain sight. The macOS payload looks like an Apple system
> process. The Windows payload looks like Windows Terminal. The Linux
> payload looks like the system linker. If you went looking for suspicious
> files, these would blend into the noise of your operating system. That's
> not accidental. That's craft.

### The RAT

All three platform-specific payloads were RATs -- Remote Access Trojans. A
RAT gives an attacker persistent, remote control over your machine. Think
of it as a backdoor that phones home.

These RATs connected to a C2 server at `sfrclak.com`, which resolved to
142.11.206.73 on port 8000. The URL path was `/6202033`, that campaign
identifier again.

The HTTP requests were disguised to look like npm registry traffic. POST
bodies were sent to paths like `packages.npm.org/product0` for macOS,
`packages.npm.org/product1` for Windows, and `packages.npm.org/product2`
for Linux. The User-Agent header was set to a string mimicking Internet
Explorer 8 running on Windows XP:

```
mozilla/4.0 (compatible; msie 8.0; windows nt 5.1; trident/4.0)
```

Internet Explorer 8. On Windows XP. In 2026. If that User-Agent string
shows up in your network logs, something has gone badly wrong.

The first thing the RAT did upon connecting to the C2 was send a
`FirstInfo` beacon. This beacon contained:

- A unique victim identifier
- The operating system and CPU architecture
- The current username
- A full directory listing of sensitive locations

That directory enumeration specifically targeted `.ssh/` directories, where
Secure Shell (SSH) keys live. It targeted `.aws/` and `.s3cfg`, where
Amazon Web Services credentials live. It targeted `.bashrc` and `.profile`,
where environment variables -- often containing API keys and database
passwords -- are set. And it targeted `.env` files, where application
secrets live.

This is not a cryptocurrency miner. This is not ransomware. This is
reconnaissance. The attacker was harvesting credentials to pivot from
developer machines into production infrastructure. Your SSH keys, your
cloud credentials, your database passwords, your API tokens. Everything
needed to turn a compromised laptop into a compromised organization.

The C2 server then responded with second-stage payloads. What those payloads
did is still being analyzed. By the time researchers were capturing live C2
traffic, the initial beacon and credential harvesting had already occurred
for anyone who installed the poisoned versions.


## The Self-Cleanup

This is the part of the attack that should keep you up at night.

After `setup.js` installed the RAT and it was running in the background,
the script deleted itself. Then it did something clever. The
`plain-crypto-js` package included a file called `package.md` -- not
`package.json`, but `package.md`. This file contained a clean, innocent-
looking `package.json` structure showing version 4.2.0 with no postinstall
script defined.

The setup script renamed `package.md` to `package.json`, overwriting the
original `package.json` that contained the malicious postinstall hook.

When the script finished, here is what your `node_modules/plain-crypto-js`
directory looked like:

- `setup.js` -- gone, deleted
- `package.json` -- clean, shows version 4.2.0, no postinstall script

If you went looking for evidence of the attack in your project directory,
you would find nothing. The package was there. It looked normal. It looked
like version 4.2.0, the clean decoy that was published eighteen hours
before the malicious version. There was no postinstall script. There was
no `setup.js`. There was nothing to find.

The evidence was not in your project directory. It was a process running on
your operating system, phoning home to a server in a data center, sending
your SSH keys and AWS credentials to someone you've never met.

This is what makes supply chain attacks fundamentally different from
application-level vulnerabilities. A Cross-Site Scripting (XSS) bug or a
SQL injection vulnerability exists in your code, where you can find it,
audit it, and fix it. A supply chain attack executes during installation,
before your application ever runs, and then erases itself. The attack
surface is not your code. It's your build process.

> **For beginners:** Imagine hiring a contractor to install shelves in your
> house. They install the shelves perfectly. They also, while you weren't
> looking, made a copy of your house keys. Then they cleaned up all evidence
> they were ever there. The shelves look great. You'd never know anything
> happened. Except now someone else has your keys.


## The Human Story

Security bulletins are written in passive voice with clinical detachment.
This is not a security bulletin. This is a story about people, and the
human dimension of this attack is where it hurts the most.

### The Maintainer Who Could Only Watch

DigitalBrainJS is a co-maintainer of axios on GitHub. When reports started
flooding in about suspicious versions, he was online. He could see what was
happening. He pinned an issue to the repository to warn users.

The attacker, using the compromised lead maintainer's credentials, unpinned
it.

People opened GitHub issue number 10590 to report the compromise. The
attacker deleted it. Using the same stolen credentials that gave them npm
publishing rights, they had full administrative access to the GitHub
repository. They could delete issues. They could unpin warnings. They
could silence the alarm.

DigitalBrainJS said it plainly: "his git permissions are higher than mine.
I'm a collaborator, not an admin."

He confirmed the compromise at 03:06 UTC. He contacted npm administration
at 03:20 UTC. npm revoked the tokens and removed the poisoned versions at
03:40 UTC. Between the first poisoned publish and the final takedown: three
hours and forty minutes.

Three hours and forty minutes where one of the most critical packages in
the JavaScript ecosystem was serving malware. Because one account got
compromised, and the one person who noticed couldn't do anything about it.

### The Timing Was Deliberate

The attacker published the first poisoned version at 00:21 UTC. That is
midnight in London. Late evening on the US East Coast. Late afternoon on
the US West Coast, but trending toward end-of-business. This timing
maximizes the window before a response can be organized. Security teams
are understaffed overnight. Maintainers are asleep. npm's support staff
is reduced.

The 39-minute gap between the two poisoned versions -- 1.14.1 first, then
0.30.4 -- suggests the attacker checked that the first publish worked
before committing the second. Methodical. Patient. Not someone's first
time.


## The Detection

Credit where credit is due. Socket.dev detected the anomaly at 00:05 UTC,
sixteen minutes before the first poisoned axios version was even published.
They caught `plain-crypto-js@4.2.1` -- the malicious dependency -- when it
hit the registry at 23:59 UTC on March 30. Their automated analysis flagged
the obfuscated postinstall script.

StepSecurity captured live C2 callbacks at 01:30 UTC, providing concrete
evidence that the malware was functioning as designed and that the command-
and-control infrastructure was active. This evidence was critical for
getting npm to act quickly.

GitHub issue discussions, despite the attacker's attempts to delete them,
eventually reached the axios co-maintainer and npm's security team. The
community's persistence in re-opening reports after the attacker deleted
them was a small act of defiance that mattered.

Socket.dev published the initial advisory. Silas Cutler published a
comprehensive scanner. StepSecurity published their C2 traffic analysis.
The open-source security community responded in hours. It wasn't fast
enough to prevent all infections, but it was fast enough to limit the blast
radius to that three-hour-and-forty-minute window.


## Our Response

Here's what a small team does when this happens. Not a security department
with a budget and an incident response playbook. A solo developer with an
AI team, finding out at night that one of their core dependencies just
tried to install a backdoor on 83 million machines.

### Immediate: Pin Everything

[Stoney](../agents/stoney-eagle.md) ordered an immediate version pin the
moment the advisory crossed our radar. No discussion. No risk assessment
meeting. No "let's wait for the official post-mortem." Immediate.

Every `package.json` in every NoMercy project was updated to pin axios at
version 1.14.0 -- the last known-clean version. Not a version range like
`^1.14.0` that could float up to 1.14.1. Not `latest`. A specific, exact
version number. Eight `package.json` files across the workspace, all
pinned.

The production server got patched through yarn resolutions, forcing
1.14.0 regardless of what any transitive dependency requested.

### Second: Verify We're Clean

We were on axios 1.14.0. The first poisoned version was 1.14.1. One patch
version separated us from a RAT.

That's not good enough. "We think we're clean" is not the same as "we've
verified we're clean."

[Wren](../agents/secops-engineer.md) and
[Rampart](../agents/network-sentinel.md) ran a full Indicators of
Compromise (IOC) scan on the local development machine. Every file path
the malware was known to use. Every registry key on Windows. Every process
name matching the malware's disguises. Every network connection to the C2
server. Every hash matching the known malicious binaries.

The scan checked for:

- The disguised PowerShell executable at `%PROGRAMDATA%\wt.exe`
- The VBScript dropper at `%TEMP%\6202033.vbs`
- The macOS payload at `/Library/Caches/com.apple.act.mond`
- The Linux payload at `/tmp/ld.py`
- Active network connections to 142.11.206.73
- The `plain-crypto-js` package in any `node_modules` directory
- The poisoned axios versions in any lockfile
- Running processes with names matching `wt.exe`, `act.mond`, or `ld.py`
  in unexpected locations

Everything came back clean.

But those thirty seconds between running the scanner and seeing the results
were not comfortable seconds.

### Third: Build a Public Scanner

This wasn't just our problem. Every developer who ran `npm install` between
00:21 and 03:40 UTC on March 31 was potentially affected. So we built a
scanner and published it.

A Windows batch script and a Linux shell script that checks for every known
IOC from this specific attack. File paths, process names, registry entries,
network connections, lockfile versions, binary hashes. We published it as a
[public gist](https://gist.github.com/StoneyEagle/f2ee5fd81d94c3fcd1993422462b6916)
with full documentation, alongside
[Silas Cutler's scanner](https://gist.github.com/silascutler/f6a709abf6a387deb0b0ac21c5f6c0b7)
which approached detection from a complementary angle.

The scanner is not elegant. It's a batch file. It checks hardcoded paths
and hashes. It will stop being useful the moment the attacker changes
their infrastructure or file names. But for this specific incident, on the
day it mattered, it told people whether they were compromised. That's all
it needed to do.

### Fourth: Document Everything

Every hash. Every file path. Every network indicator. Every timestamp. All
of it documented, all of it public.

Here are the SHA-256 hashes of the known malicious payloads.

The Windows first-stage payload:
`f7d335205b8d7b20208fb3ef93ee6dc817905dc3ae0c10a0b164f4e7d07121cd`

The Windows second-stage payload:
`617b67a8e1210e4fc87c92d1d1da45a2f311c08d26e89b12307cf583c900d101`

The macOS payload:
`92ff08773995ebc8d55ec4b8e1a225d0d1e51efa4ef88b8849d0071230c9645a`

The Linux payload:
`fcb81618bb15edfdedfb638b4c08a2af9cac9ecfa551af135a8402bf980375cf`

And the SHA-1 package shasums for the poisoned npm packages themselves.

axios version 1.14.1:
`2553649f2322049666871cea80a5d0d6adc700ca`

axios version 0.30.4:
`d6f3f62fd3b9f5432f5782b62d8cfd5247d5ee71`

plain-crypto-js version 4.2.1:
`07d889e2dadce6f3910dcbc253317d28ca61c766`

If any of these hashes appear in your systems, you have a problem. A
serious one.


## The Lessons

### The Trust Model Is Broken

Here is the uncomfortable truth.

npm's security model is built on trust in individual maintainer accounts.
When you run `npm install axios`, you are trusting that every person with
publishing rights to that package has secure credentials, hasn't been
phished, hasn't reused passwords, hasn't left a token in a public
repository, hasn't had their laptop stolen. You're also trusting the same
about every maintainer of every dependency that axios depends on. And their
dependencies. And their dependencies' dependencies.

Axios has two maintainers. One of them got compromised. That single account
had the authority to push arbitrary code to 83 million weekly installations
with no code review, no secondary approval, no CI verification, and no
mandatory two-factor authentication at the organizational level.

This is not an axios problem. This is an npm problem. This is a
"the entire JavaScript ecosystem runs on trust in individual humans who
can be phished" problem.

### Postinstall Scripts Are the Attack Surface

The `postinstall` hook in npm's `package.json` is the most exploited vector
in JavaScript supply chain attacks. It allows arbitrary code execution
during installation. Before your application runs. Before your test suite
runs. Before any security scanner inspects your code. The code runs on your
machine with your permissions the moment `npm install` finishes downloading
the package.

There have been proposals to disable postinstall scripts by default or
require explicit opt-in. They haven't been implemented. The feature is too
deeply embedded in the ecosystem. Too many legitimate packages depend on it
for native module compilation, binary downloads, and setup tasks.

Until that changes, `npm install` is `npm install-and-also-run-whatever-
code-the-maintainer-wants-on-your-machine`. That's the contract. Read it
carefully.

### Long-Lived Tokens Are a Liability

The compromised token was a long-lived npm access token. It didn't expire
on its own. It wasn't scoped to a CI pipeline. It wasn't tied to a
hardware key. It was a persistent credential that, once stolen, gave the
attacker unlimited publishing access until someone manually revoked it.

NoMercy uses OIDC-based trusted publishing for its own npm packages. This
means our packages can only be published by our GitHub Actions CI pipeline.
No human has a long-lived npm token. If someone compromised a team member's
credentials, they couldn't publish a poisoned version of our packages
through the npm CLI because no such token exists. The only publishing path
goes through CI, which requires the code to exist in the repository and
pass through the pipeline.

This is not a flex. This is the minimum standard that every package with
significant download counts should meet. The fact that a package with 83
million weekly downloads was publishable via a single stolen human
credential is a systemic failure.

### The Bus Factor Matters

The term "bus factor" refers to a grim question: how many team members need
to be unavailable before a project is stuck? In axios's case, the answer
was one. One compromised account, and the co-maintainer couldn't revoke
access, couldn't remove poisoned packages, couldn't even keep a warning
pinned to the repository.

If you maintain an open-source package that others depend on, shared admin
access is not optional. Backup credentials are not optional. A documented
incident response plan is not optional. These are not paranoid precautions.
They are the bare minimum of stewardship for code that other people trust.

### Self-Cleanup Changes the Game

Most supply chain attacks leave evidence. A malicious package sits in your
`node_modules` with suspicious code that a scanner can find. This attack
was different. The malware deleted itself. It replaced its own
`package.json` with a clean decoy. By the time `npm install` finished,
there was nothing to scan.

This means the traditional advice of "audit your `node_modules` directory"
is insufficient. If the malware cleans up after itself, auditing the
directory after installation finds nothing. You need to audit before
installation, by reviewing lockfile changes and checking package contents
before running install. Or you need endpoint detection that watches for
suspicious process creation during the install process itself.

The security community's tooling has not caught up with self-cleaning
payloads. Most npm audit tools scan what's on disk after installation.
That approach assumes the evidence will still be there. This attack proved
that assumption wrong.


## What We Still Don't Know

Let's be honest about the gaps.

We don't know how the maintainer's token was stolen. Phishing? Credential
reuse? Compromised machine? Leaked in a log? The method of initial access
hasn't been publicly confirmed, and it matters because it determines which
defenses would have prevented this.

We don't know the full capability of the second-stage payloads. The RAT
sent credentials to the C2 server and received additional payloads in
return. What those payloads did on infected machines is still being
analyzed.

We don't know how many machines were compromised. Three hours and forty
minutes of exposure, 83 million weekly downloads. Even a small fraction of
that is a large number. The poisoned versions have been pulled, but pulling
a package from the registry doesn't uninstall it from machines that already
downloaded it. Those RATs are still running on machines whose owners haven't
seen the advisory yet.

We don't know if the attacker harvested credentials that will be used in
future attacks. The RAT targeted SSH keys, AWS credentials, and environment
files. If those were exfiltrated before the C2 server was identified, the
stolen credentials could enable a second wave of attacks on entirely
different infrastructure.


## What This Means for Us

The axios pin protects us from this specific attack. It does not protect us
from the next one. The npm ecosystem's fundamental trust model is unchanged
after this incident. We are one careless `npm update` away from pulling in
whatever the next compromised package is.

Here is what we're doing going forward:

- **Lockfiles are sacred.** Every lockfile change gets reviewed. Not
  rubber-stamped. Reviewed. If a dependency version changed, we check why.
- **Exact version pins for critical dependencies.** No floating ranges for
  packages in the critical path. Axios, and any dependency that runs code
  during installation, gets pinned to a specific version.
- **OIDC-only publishing for our own packages.** Already in place. No
  long-lived npm tokens exist on this team.
- **IOC monitoring after any dependency update.** Paranoid? Maybe. But
  today "paranoid" means "not infected."

This doesn't make us safe. Nothing makes you safe in an ecosystem where
`npm install` means "run arbitrary code from strangers on your machine."
But it makes us deliberate. And deliberate is better than trusting.

> **For beginners:** If you maintain any project that uses npm, here is the
> minimum you should do right now. First, check your `package-lock.json` or
> `yarn.lock` for `axios@1.14.1` or `axios@0.30.4`. If either appears, you
> may have been compromised. Run a scanner. Second, pin your axios version
> to 1.14.0 or wait for an official clean release from the axios team.
> Third, consider whether your other dependencies use long-lived publish
> tokens or OIDC-based trusted publishing. You probably can't find out
> easily. That's part of the problem.


## Agent Notes

This was a security response, not a feature session. The team was small and
focused.

[Wren](../agents/secops-engineer.md) ran the IOC analysis. Fast, thorough,
no panic. Exactly what you want from your security specialist during an
incident.

[Rampart](../agents/network-sentinel.md) identified network-level
indicators -- the C2 IP, the disguised HTTP paths, the absurd IE8
User-Agent string -- and fed them into the scanner.

[Arc](../agents/cto.md) coordinated the version pinning across all eight
package.json files and the production server patch.

[Stoney](../agents/stoney-eagle.md) made the call that mattered: immediate
response, no waiting, pin everything now and ask questions later. In
incident response, speed beats perfection. You can always loosen a pin
later. You can't un-install a RAT by wishing.

And then, because that's who he is, he built the public scanner and
published the gist so that other developers who didn't have a security team
could check their machines too. That's the kind of thing that doesn't show
up in a sprint velocity report but matters more than anything that does.


## The Uncomfortable Question

I'm going to end with the question that nobody in the JavaScript ecosystem
wants to answer, because there isn't a good answer.

What do you do when the trust model is the vulnerability?

You can pin versions. You can audit lockfiles. You can run scanners. You
can use OIDC publishing for your own packages. You can do everything right.
And you are still dependent on every maintainer of every package in your
dependency tree doing everything right too. One stolen token. One
compromised account. One `npm publish` from an attacker's machine. That's
all it takes.

Axios was not a small package maintained by a hobbyist. It was one of the
most downloaded packages on npm. It had active maintainers. It had a
community. And it was compromised because one account's credential was
stolen, and the trust model provided no second layer of defense.

This will happen again. The target will be different. The payload will be
different. The obfuscation will be more sophisticated. The self-cleanup
will be better. The timing will be even more deliberate.

The question is whether the ecosystem will change before it does.


## Timeline Summary

For reference, here is the complete timeline of the attack in UTC. All
times are approximate based on publicly available reports.

March 30, 05:57 -- The attacker publishes plain-crypto-js version 4.2.0,
the clean decoy, to npm.

March 30, 23:59 -- The attacker publishes plain-crypto-js version 4.2.1,
the malicious version with the obfuscated postinstall payload.

March 31, 00:05 -- Socket.dev detects the anomaly in plain-crypto-js
version 4.2.1. Automated analysis flags the obfuscated code.

March 31, 00:21 -- The attacker publishes axios version 1.14.1, which
depends on plain-crypto-js version 4.2.1. The supply chain is now
poisoned.

March 31, 01:00 -- The attacker publishes axios version 0.30.4, covering
the 0.x release branch. Both major branches are now compromised.

March 31, 01:30 -- StepSecurity captures live C2 callbacks, confirming
the malware is active and the command-and-control infrastructure is
operational.

March 31, approximately 03:00 -- A GitHub issue is filed reporting the
compromise. The attacker deletes it using the stolen maintainer
credentials.

March 31, 03:06 -- DigitalBrainJS, the axios co-maintainer, confirms the
compromise publicly. He cannot revoke the attacker's access because he is
a collaborator, not an admin.

March 31, 03:20 -- DigitalBrainJS contacts npm administration.

March 31, 03:40 -- npm revokes the compromised tokens and removes the
poisoned versions from the registry. The attack window closes after
approximately three hours and forty minutes.


---

*This is Entry 007 of Shipping in the Dark. A standalone deep dive into
the axios supply chain attack of March 31, 2026. For the session where
we responded to this attack alongside four other fires, see
[Entry 006](../entries/2026-03-31-006-the-day-the-supply-chain-broke).*

*If you're not sure whether you were affected, check your lockfiles for
axios 1.14.1 or 0.30.4 and run
[our scanner](https://gist.github.com/StoneyEagle/f2ee5fd81d94c3fcd1993422462b6916)
or [Silas Cutler's scanner](https://gist.github.com/silascutler/f6a709abf6a387deb0b0ac21c5f6c0b7).
If you maintain an npm package with significant downloads, please set up
OIDC-based trusted publishing and shared admin access. The rest of us are
downstream of your security decisions.*

*Previous entries:
[How the CTO Locked the Boss Out](../entries/2026-03-16-001-how-the-cto-locked-the-boss-out),
[Twenty-Seven Repos and a Makefile](../entries/2026-03-16-002-twenty-seven-repos-and-a-makefile),
[Validate Reality, Not Assumptions](../entries/2026-03-17-003-validate-reality-not-assumptions),
[Movie Night](../entries/2026-03-17-004-movie-night),
[The Great Office Cleanup](../entries/2026-03-19-005-the-great-office-cleanup),
[The Day the Supply Chain Broke](../entries/2026-03-31-006-the-day-the-supply-chain-broke).*
