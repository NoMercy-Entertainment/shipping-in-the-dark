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
//
// git log failing here is not hypothetical: it took down the deploy gate
// the first time this shipped. The fallback used mtime whenever git
// couldn't answer, and a fresh checkout's mtime is "now" for every file --
// which reads as "retimed after narration" for the entire catalog at once,
// the moment git log itself stopped working in that environment for any
// reason. "git has no history for this path" and "git itself is broken"
// are different failures and need different responses, so this returns
// which one happened instead of collapsing both to null:
//   { ok: true,  ms }    — a real commit time
//   { ok: true,  ms: null } — git works, this path just has no commits yet
//                              (a genuine uncommitted local edit)
//   { ok: false }        — git could not be run at all; do not trust mtime
//                              either, just skip with a loud warning
let gitBroken = null; // cached across calls: null = untested, else boolean
function gitWorks() {
	if (gitBroken === null) {
		try {
			execFileSync('git', ['log', '-1', '--format=%H'], { cwd: REPO_ROOT, encoding: 'utf8' });
			// A shallow clone (the deploy checkout's default, absent an
			// explicit fetch-depth: 0) makes every file's history stop at
			// the single fetched commit -- git log for a path that commit
			// didn't touch returns empty rather than throwing, which this
			// function alone can't tell apart from "genuinely uncommitted."
			// Treating a shallow repo as broken here is what actually
			// matters, independent of whichever workflow config happens to
			// be in place today.
			const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
				cwd: REPO_ROOT, encoding: 'utf8',
			}).trim();
			if (shallow === 'true') {
				gitBroken = true;
				console.error(`WARNING: ${REPO_ROOT} is a shallow git clone -- every path's history stops at one commit, so it cannot be trusted to tell a real retime from a fresh checkout. Skipping the retiming check rather than falling back to filesystem mtime.`);
			} else {
				gitBroken = false;
			}
		} catch (err) {
			gitBroken = true;
			console.error(`WARNING: git is not usable from ${REPO_ROOT} (${err.message.split('\n')[0]}) -- skipping the retiming check rather than falling back to filesystem mtime, which is unreliable on a fresh checkout.`);
		}
	}
	return !gitBroken;
}
function gitCommittedAtMs(absPath) {
	if (!gitWorks()) return { ok: false };
	const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
	const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', rel], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
	}).trim();
	return { ok: true, ms: out ? Number(out) * 1000 : null };
}

const failures = [];

function cueIds(text) {
	const re = /^((?:(p|h|code|i)-(\d+))|title|standfirst|part-title)\s*$/gm;
	return [...text.matchAll(re)].map(m => {
		if (m[2]) return { id: m[1], kind: m[2], n: Number(m[3]) };
		return { id: m[1], kind: m[1], n: null };
	});
}

// Body text of the very first cue block in the VTT, in document order --
// unlike a plain regex search for a marker pattern, this does not skip past
// leading unmarked "--" cues to find the first thing that happens to look
// like a marker further down the file.
function firstCueBody(text) {
	const lines = text.replace(/\r/g, '').split('\n');
	let i = 0;
	while (i < lines.length && !/^\d+$/.test(lines[i])) i++;
	if (i >= lines.length) return null;
	i++; // past the cue number
	if (!/-->/.test(lines[i] || '')) return null;
	i++; // past the timestamp line
	const body = [];
	while (i < lines.length && lines[i].trim() !== '') {
		body.push(lines[i].trim());
		i++;
	}
	return body.join(' ').trim();
}

function narratesTitle(text) {
	// The very first cue in the VTT should be one of: title (an entry, or a
	// report's part 0 narrating its own outer title first), part-title
	// (every other report part narrating its own heading first), or the
	// legacy h-1 shape some team profiles still use (opening directly on
	// their own page heading rather than a synthesized title line). A
	// leading run of bare "--" text no longer counts — title, standfirst
	// and part-title all have real markers now, so a script still opening
	// on unmarked "--" was never migrated to use them.
	const first = firstCueBody(text);
	return first === 'title' || first === 'part-title' || first === 'h-1';
}

function sequenceBreaks(ids) {
	const last = {};
	const breaks = [];
	for (const cue of ids) {
		// title / standfirst / part-title are singular — there is only ever
		// one of each in scope, so they carry no number and no sequence.
		if (cue.n === null) continue;
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
		for (const m of html.matchAll(/data-audio-title="(title)"/g)) rendered.add(m[1]);
		for (const m of html.matchAll(/data-audio-standfirst="(standfirst)"/g)) rendered.add(m[1]);
		for (const m of html.matchAll(/data-audio-part-title="(part-title)"/g)) rendered.add(m[1]);
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

// Audio can be fully produced and still be invisible. Entry 011 shipped with
// its mp3 on the release, its VTT committed here and its manifest stamp
// recorded, and the page rendered no player at all, because the frontmatter
// carried neither audio_url nor vtt_url and the layout has nothing to pass
// down. Every check above passes in that state: the VTT is internally
// perfect, it just isn't referenced by anything.
//
// Entries and team profiles name their audio in frontmatter. Report parts
// resolve theirs by convention instead, so they are checked further down
// against that convention rather than against a declared url.
function frontmatter(text) {
	const m = text.replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---/);
	if (!m) return {};
	const fields = {};
	for (const line of m[1].split('\n')) {
		const kv = line.match(/^([a-z_]+):\s*(.+?)\s*$/);
		if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
	}
	return fields;
}

const declaresAudio = [
	{
		dir: path.join(REPO_ROOT, 'entries'),
		label: 'entries',
		// The URL is the slug field, not the dated filename, and the VTT is
		// named after the same slug.
		vttRelFor: fields => (fields.slug ? `${fields.slug}.vtt` : null),
	},
	{
		dir: path.join(SITE, 'src/content/agents'),
		label: 'team profile',
		vttRelFor: (_fields, file) => `team/${path.basename(file, '.md')}.vtt`,
	},
];

for (const { dir, label, vttRelFor } of declaresAudio) {
	if (!fs.existsSync(dir)) continue;
	for (const name of fs.readdirSync(dir)) {
		if (!name.endsWith('.md')) continue;
		const file = path.join(dir, name);
		const fields = frontmatter(fs.readFileSync(file, 'utf8'));
		const vttRel = vttRelFor(fields, file);
		if (!vttRel) continue;

		const hasVtt = fs.existsSync(path.join(AUDIO, vttRel));
		const expected = `/audio/${vttRel}`;

		if (hasVtt && !fields.vtt_url) {
			failures.push(`${label} ${name}: ${vttRel} exists but the frontmatter has no vtt_url, so the page renders no player`);
		} else if (fields.vtt_url && fields.vtt_url !== expected) {
			failures.push(`${label} ${name}: vtt_url is ${fields.vtt_url}, expected ${expected}`);
		}

		if (hasVtt && !fields.audio_url) {
			failures.push(`${label} ${name}: ${vttRel} exists but the frontmatter has no audio_url, so the page renders no player`);
		} else if (fields.audio_url && !fields.audio_url.endsWith(`/${path.basename(vttRel, '.vtt')}.mp3`)) {
			failures.push(`${label} ${name}: audio_url does not point at ${path.basename(vttRel, '.vtt')}.mp3`);
		}
	}
}

// reports/[report].astro builds four fixed paths per part, one per voice and
// length, and hands all four to the player so a voice swap is instant. A part
// missing one of them gives the player a url that 404s the moment the reader
// switches to that combination -- and only that combination, which is why it
// survives a hand-check. The mp3 counterpart cannot be fetched from a build,
// but the manifest records every mp3 the pipeline wrote, so a stamp missing
// there is the same absence one layer earlier.
const REPORTS_SRC = path.join(REPO_ROOT, 'reports');
const VOICES = ['female', 'male'];
const LENGTHS = ['brief', 'elaborate'];
const manifestPath = path.join(AUDIO, 'audio-manifest.json');
const stamps = fs.existsSync(manifestPath)
	? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
	: null;

if (fs.existsSync(REPORTS_SRC)) {
	for (const report of fs.readdirSync(REPORTS_SRC)) {
		const partsDir = path.join(REPORTS_SRC, report);
		if (!fs.statSync(partsDir).isDirectory()) continue;
		for (const name of fs.readdirSync(partsDir)) {
			if (!name.endsWith('.md')) continue;
			const slug = path.basename(name, '.md');
			for (const voice of VOICES) {
				for (const length of LENGTHS) {
					const variant = `${slug}.${voice}.${length}`;
					const vttRel = `reports/${report}/${variant}.vtt`;
					if (!fs.existsSync(path.join(AUDIO, vttRel))) {
						failures.push(`report ${report}/${name}: no ${vttRel}, so the ${voice} ${length} track 404s`);
					}
					if (stamps && !stamps[`reports/${report}/${variant}.mp3`]) {
						failures.push(`report ${report}/${name}: the manifest has no stamp for ${variant}.mp3, so that audio was never produced`);
					}
				}
			}
		}
	}
}

// A VTT rewritten without re-narrating the audio is the worst failure here,
// because it looks correct: the title cue is present, the ids all resolve,
// and the shift gets absorbed by the trailing silence so an end-alignment
// check still passes. The tell is a marker file newer than the speech it
// claims to describe.
if (stamps) {
	for (const file of walkVtts(AUDIO)) {
		const rel = path.relative(AUDIO, file).replace(/\\/g, '/');
		const audioStamp = stamps[rel.replace(/\.vtt$/, '.mp3')];
		if (!audioStamp) continue;
		const committed = gitCommittedAtMs(file);
		// git itself unusable in this environment: already warned once by
		// gitWorks(); skip rather than compare against mtime, which is "now"
		// for every file on a fresh checkout and would fail the entire
		// catalog at once, as it did the first time this shipped.
		if (!committed.ok) continue;
		// git works but this exact path has no commit history yet: a real
		// uncommitted local edit, worth still catching with mtime since that
		// is a genuine in-progress retime with nothing to hide behind.
		const compareAt = committed.ms !== null ? committed.ms : fs.statSync(file).mtimeMs;
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
