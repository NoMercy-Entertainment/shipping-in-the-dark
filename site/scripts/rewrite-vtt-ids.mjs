/**
 * rewrite-vtt-ids.mjs
 *
 * Rewrites VTT cue text from spoken prose to deterministic p-N paragraph ID
 * references. Reads the built HTML for an entry, extracts all <p id="p-N">
 * elements and their text, then matches each VTT cue to the best paragraph
 * by normalized word-overlap scoring.
 *
 * Usage:
 *   node scripts/rewrite-vtt-ids.mjs <slug>
 *   node scripts/rewrite-vtt-ids.mjs --all
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(__dirname, '..');
const distRoot = join(siteRoot, 'dist');
const audioDir = join(siteRoot, 'public', 'audio');

const ALL_SLUGS = [
	'how-the-cto-locked-the-boss-out',
	'twenty-seven-repos-and-a-makefile',
	'validate-reality-not-assumptions',
	'movie-night',
	'the-great-office-cleanup',
];

// ------------------------------------------------------------------ //
// Text normalization — same as AudioSync client-side                   //
// ------------------------------------------------------------------ //

function normalize(text) {
	return text
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/[^\w\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

// ------------------------------------------------------------------ //
// HTML paragraph extraction                                            //
// ------------------------------------------------------------------ //

/**
 * Extract all <p id="p-N"> elements from the built HTML.
 * Returns an array of { id: 'p-N', text: 'normalized text', words: Set<string> }
 */
function extractParagraphs(htmlPath) {
	const html = readFileSync(htmlPath, 'utf-8');

	// Match <p id="p-N">...content...</p>
	// The HTML is minified, so paragraphs may span a single line or multiple.
	// Use a regex that captures the id and content between <p id="p-N"> and </p>.
	const paragraphs = [];
	const regex = /<p\s+id="(p-\d+)"[^>]*>([\s\S]*?)<\/p>/g;
	let match;

	while ((match = regex.exec(html)) !== null) {
		const id = match[1];
		const rawContent = match[2];
		const text = normalize(rawContent);
		const words = new Set(text.split(' ').filter(Boolean));
		paragraphs.push({ id, text, words });
	}

	return paragraphs;
}

// ------------------------------------------------------------------ //
// VTT parsing                                                          //
// ------------------------------------------------------------------ //

/**
 * Parse a VTT file into cue objects.
 * Returns { header: string, cues: { num: string, time: string, text: string }[] }
 */
function parseVTT(vttPath) {
	const raw = readFileSync(vttPath, 'utf-8').replace(/\r/g, '');
	const lines = raw.split('\n');
	const cues = [];
	let i = 0;

	// Capture the WEBVTT header
	const header = 'WEBVTT';
	while (i < lines.length && !lines[i].match(/^\d+$/)) i++;

	while (i < lines.length) {
		if (!lines[i].match(/^\d+$/)) { i++; continue; }

		const num = lines[i];
		i++;

		const timeLine = lines[i] || '';
		i++;

		const cueLines = [];
		while (i < lines.length && lines[i].trim() !== '') {
			cueLines.push(lines[i].trim());
			i++;
		}

		cues.push({
			num,
			time: timeLine,
			text: cueLines.join(' '),
		});
	}

	return { header, cues };
}

// ------------------------------------------------------------------ //
// Word-overlap matching                                                //
// ------------------------------------------------------------------ //

/**
 * Find the best matching paragraph for a VTT cue by word overlap.
 * Returns the paragraph id or null if no match above threshold.
 *
 * Matching pipeline:
 *   1. Exact normalized text match (handles short phrases like "He was right.")
 *   2. Word-overlap bag-of-words scoring (handles TTS rephrasing)
 *
 * @param {string} cueText     — raw cue text
 * @param {object[]} paragraphs — extracted paragraphs from HTML
 * @param {boolean} isTitle     — true for cue #1 (entry title), always unmatched
 */
function findBestMatch(cueText, paragraphs, isTitle) {
	// Cue #1 is always the entry title — never match it to a paragraph
	if (isTitle) return null;

	const normCue = normalize(cueText);
	const cueWords = normCue.split(' ').filter(Boolean);

	// Skip very short cues (single words, fragments)
	if (cueWords.length < 2) return null;

	// ---- Pass 1: Exact normalized text match ----
	// Handles short phrases like "He was right." / "No pressure." / "You see the problem."
	for (const para of paragraphs) {
		if (para.text === normCue) return para.id;
	}

	// ---- Pass 1b: Suffix match for dialogue paragraphs ----
	// Dialogue paragraphs start with "speaker: " prefix in the HTML (e.g. "wren someone should")
	// but the VTT only has the spoken text ("someone should").
	// Match if the normalized cue is a suffix of the paragraph text.
	if (cueWords.length >= 2) {
		for (const para of paragraphs) {
			if (para.text.endsWith(normCue) && para.text !== normCue) {
				// Verify it's a speaker-prefix situation (text before the match should end
				// at a word boundary, not mid-word)
				const prefix = para.text.slice(0, para.text.length - normCue.length);
				if (prefix.endsWith(' ') || prefix === '') return para.id;
			}
		}
	}

	// ---- Pass 2: Word-overlap scoring ----
	// Skip very short cues for fuzzy matching (titles, headings)
	if (cueWords.length < 3) return null;

	let bestScore = 0;
	let bestPara = null;

	for (const para of paragraphs) {
		let hits = 0;
		for (const word of cueWords) {
			if (para.words.has(word)) hits++;
		}
		const score = hits / cueWords.length;
		if (score > bestScore) {
			bestScore = score;
			bestPara = para;
		}
	}

	const threshold = cueWords.length < 6 ? 0.75 : 0.4;
	if (bestScore >= threshold) return bestPara.id;

	return null;
}

// ------------------------------------------------------------------ //
// Rewrite a single entry's VTT                                         //
// ------------------------------------------------------------------ //

function rewriteEntry(slug) {
	const htmlPath = join(distRoot, 'entry', slug, 'index.html');
	const vttPath = join(audioDir, `${slug}.vtt`);

	if (!existsSync(htmlPath)) {
		console.error(`  ERROR: Built HTML not found: ${htmlPath}`);
		return false;
	}
	if (!existsSync(vttPath)) {
		console.error(`  ERROR: VTT file not found: ${vttPath}`);
		return false;
	}

	console.log(`\nProcessing: ${slug}`);
	console.log(`  HTML: ${htmlPath}`);
	console.log(`  VTT:  ${vttPath}`);

	const paragraphs = extractParagraphs(htmlPath);
	console.log(`  Found ${paragraphs.length} paragraphs in HTML`);

	const vtt = parseVTT(vttPath);
	console.log(`  Found ${vtt.cues.length} cues in VTT`);

	let matched = 0;
	let unmatched = 0;
	let alreadyId = 0;

	const rewrittenCues = vtt.cues.map((cue, index) => {
		// Already a p-N reference? Keep it.
		if (/^p-\d+$/.test(cue.text)) {
			alreadyId++;
			return cue;
		}

		const isTitle = index === 0;
		const bestId = findBestMatch(cue.text, paragraphs, isTitle);

		if (bestId) {
			matched++;
			return { ...cue, text: bestId };
		} else {
			unmatched++;
			// Short cues (titles, headings) — prefix with -- to mark non-paragraph
			const newText = cue.text.startsWith('--') ? cue.text : `--${cue.text}`;
			return { ...cue, text: newText };
		}
	});

	console.log(`  Matched: ${matched}, Unmatched: ${unmatched}, Already ID: ${alreadyId}`);

	// Show unmatched cues for debugging
	if (unmatched > 0) {
		console.log('  Unmatched cues:');
		for (const cue of rewrittenCues) {
			if (cue.text.startsWith('--')) {
				console.log(`    [${cue.num}] ${cue.time} => ${cue.text}`);
			}
		}
	}

	// Write the updated VTT
	let output = vtt.header + '\n';
	for (const cue of rewrittenCues) {
		output += '\n' + cue.num + '\n' + cue.time + '\n' + cue.text + '\n';
	}

	writeFileSync(vttPath, output, 'utf-8');
	console.log(`  Written: ${vttPath}`);

	return true;
}

// ------------------------------------------------------------------ //
// Main                                                                 //
// ------------------------------------------------------------------ //

const args = process.argv.slice(2);

if (args.length === 0) {
	console.error('Usage: node scripts/rewrite-vtt-ids.mjs <slug|--all>');
	process.exit(1);
}

const slugs = args[0] === '--all' ? ALL_SLUGS : [args[0]];
let allOk = true;

for (const slug of slugs) {
	if (!rewriteEntry(slug)) {
		allOk = false;
	}
}

if (allOk) {
	console.log('\nAll done.');
} else {
	console.error('\nSome entries had errors.');
	process.exit(1);
}
