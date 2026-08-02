import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = path.join(
	path.dirname(fileURLToPath(new URL('..', import.meta.url))),
	'public',
);

/**
 * Highest end-timestamp in a VTT, in seconds.
 *
 * The narration lives on GitHub releases, so the audio element's own metadata
 * can take a moment to arrive. Reading the duration out of the VTT at build
 * time lets the player show a real total from the first paint instead of
 * 0:00, and lets a multi-part report total its parts without loading them.
 *
 * Returns 0 when the file is absent, which the player treats as "fall back to
 * the element's metadata".
 *
 * @param {string} vttRelPath Public-root-relative path, e.g. /audio/entry.vtt
 * @returns {number}
 */
export function vttDuration(vttRelPath) {
	if (!vttRelPath) return 0;
	try {
		const text = fs.readFileSync(path.join(publicRoot, vttRelPath.replace(/^\//, '')), 'utf-8');
		let max = 0;
		const pattern = /\d+:\d+:\d+\.\d+\s*-->\s*(\d+):(\d+):(\d+)\.(\d+)/g;
		let match;
		while ((match = pattern.exec(text)) !== null) {
			const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4]}`);
			if (seconds > max) max = seconds;
		}
		return max;
	} catch {
		return 0;
	}
}
