/**
 * VTT integrity guard.
 *
 * Three failures have reached the live site by hand-checking instead of this:
 * a part that never narrates its own title, cue ids that skip elements the
 * page renders (list items were given ids and then never spoken), and a cue
 * pointing at an id that does not exist at all.
 *
 * Run after a build so dist/ is present:
 *   node scripts/check-vtt-integrity.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SITE = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(SITE, '..');
const AUDIO = path.join(SITE, 'public/audio');
const DIST = path.join(SITE, 'dist');

// The CI collect step writes the VTT and commits it in the same job it
// records the manifest stamp in, so comparing timestamps is only valid
// against the commit time, not the filesystem mtime -- a plain git clone
// or pull resets every touched file's mtime to checkout time regardless of
// when its content actually landed, which would flag whichever VTT you
// happened to pull most recently as "retimed" even when it is perfectly in
// sync with its audio.
function gitCommittedAtMs(absPath) {
	try {
		const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
		const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', rel], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
		}).trim();
		return out ? Number(out) * 1000 : null;
	} catch {
		return null;
	}
}

const failures = [];

function cueIds(text) {
	return [...text.matchAll(/^((?:p|h|code|i)-(\d+))\s*$/gm)].map(m => ({
		id: m[1],
		kind: m[1].split('-')[0],
		n: Number(m[2]),
	}));
}

function narratesTitle(text) {
	// Two shapes both count. Reports and entries open with a run of "--" cues
	// carrying the spoken title before any marker. Team profiles instead open
	// on h-1, which is the page's own heading — narrated and highlightable,
	// so it is the better of the two rather than a miss.
	const firstMarker = text.search(/^(?:p|h|code|i)-\d+\s*$/m);
	const firstSpoken = text.search(/^--/m);
	if (firstSpoken !== -1 && (firstMarker === -1 || firstSpoken < firstMarker)) return true;

	const firstCue = text.match(/^(?:p|h|code|i)-\d+\s*$/m);
	return firstCue ? firstCue[0].trim() === 'h-1' : false;
}

function sequenceBreaks(ids) {
	const last = {};
	const breaks = [];
	for (const cue of ids) {
		if (last[cue.kind] !== undefined && cue.n !== last[cue.kind] + 1) {
			breaks.push(`${cue.kind}-${last[cue.kind]} => ${cue.id}`);
		}
		last[cue.kind] = cue.n;
	}
	if (ids.some(c => c.kind === 'p') && ids.find(c => c.kind === 'p').n !== 1) {
		breaks.push('first paragraph cue is not p-1');
	}
	return breaks;
}

function walkVtts(dir) {
	const found = [];
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		if (fs.statSync(full).isDirectory()) found.push(...walkVtts(full));
		else if (name.endsWith('.vtt')) found.push(full);
	}
	return found;
}

for (const file of walkVtts(AUDIO)) {
	const rel = path.relative(AUDIO, file).replace(/\\/g, '/');
	const text = fs.readFileSync(file, 'utf8');
	const ids = cueIds(text);
	if (!ids.length) continue;

	if (!narratesTitle(text)) {
		failures.push(`${rel}: never narrates its own title`);
	}

	for (const brk of sequenceBreaks(ids)) {
		failures.push(`${rel}: cue sequence skips ${brk}`);
	}
}

// Cross-check every id against what the build actually rendered.
if (fs.existsSync(DIST)) {
	const pages = [];
	(function walk(dir) {
		for (const name of fs.readdirSync(dir)) {
			const full = path.join(dir, name);
			if (fs.statSync(full).isDirectory()) walk(full);
			else if (name === 'index.html') pages.push(full);
		}
	})(DIST);

	const rendered = new Set();
	for (const page of pages) {
		const html = fs.readFileSync(page, 'utf8');
		for (const m of html.matchAll(/id="(p-\d+)"/g)) rendered.add(m[1]);
		for (const m of html.matchAll(/data-audio-h="(h-\d+)"/g)) rendered.add(m[1]);
		for (const m of html.matchAll(/data-audio-code="(code-\d+)"/g)) rendered.add(m[1]);
		// Images never get a literal id — Astro's own asset pipeline
		// regenerates the <img> tag and does not preserve one reliably, which
		// is exactly why paragraph-ids-rehype.mjs sets data-audio-i instead
		// (see that file's comment). That is also what AudioSync.astro and
		// AudioPlayer.astro actually query at runtime, so checking for a
		// literal id="i-N" here was validating an attribute the real
		// highlighter never looks at, and flagged every legitimate image cue
		// as unresolved.
		for (const m of html.matchAll(/data-audio-i="(i-\d+)"/g)) rendered.add(m[1]);
	}

	for (const file of walkVtts(AUDIO)) {
		const rel = path.relative(AUDIO, file).replace(/\\/g, '/');
		for (const cue of cueIds(fs.readFileSync(file, 'utf8'))) {
			if (!rendered.has(cue.id)) {
				failures.push(`${rel}: cue ${cue.id} resolves to nothing in the build`);
			}
		}
	}
} else {
	console.log('dist/ not built — skipped the rendered-id cross-check');
}

// A VTT rewritten without re-narrating the audio is the worst failure here,
// because it looks correct: the title cue is present, the ids all resolve,
// and the shift gets absorbed by the trailing silence so an end-alignment
// check still passes. The tell is a marker file newer than the speech it
// claims to describe.
const manifest = path.join(AUDIO, 'audio-manifest.json');
if (fs.existsSync(manifest)) {
	const stamps = JSON.parse(fs.readFileSync(manifest, 'utf8'));
	for (const file of walkVtts(AUDIO)) {
		const rel = path.relative(AUDIO, file).replace(/\\/g, '/');
		const audioStamp = stamps[rel.replace(/\.vtt$/, '.mp3')];
		if (!audioStamp) continue;
		const committedAt = gitCommittedAtMs(file);
		// An uncommitted local edit has no git history to compare yet --
		// fall back to mtime so a real, in-progress fix still gets caught
		// rather than silently skipped.
		const compareAt = committedAt ?? fs.statSync(file).mtimeMs;
		// The manifest stamp is taken when the mp3 is written on the
		// self-hosted runner; the VTT lands in a separate git commit once
		// the collect step gathers every matrix job's output, builds the
		// manifest, and pushes. Measured across a full regen, that gap runs
		// 7-8 minutes on its own before any real desync — 20 minutes gives
		// headroom for a slower run without hiding a VTT that was actually
		// retimed hours or days after its audio.
		if (compareAt > audioStamp + 20 * 60_000) {
			failures.push(`${rel}: timings rewritten after the audio was last narrated`);
		}
	}
}

if (failures.length) {
	console.error(`VTT integrity: ${failures.length} problem(s)\n`);
	for (const f of failures) console.error(`  ${f}`);
	process.exit(1);
}

console.log('VTT integrity: clean');
