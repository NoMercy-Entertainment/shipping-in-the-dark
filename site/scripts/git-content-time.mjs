import { execFileSync } from 'node:child_process';

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// When the file's current content was first committed, in ms; null when that content has no commit yet.
// Content, not the last commit: text put back to its narrated words counts from when those words existed.
export function contentCommittedAtMs(repoRoot, relPath) {
	const current = git(repoRoot, ['hash-object', '--', relPath]);
	let earliest = null;
	for (const line of git(repoRoot, ['log', '--format=%H %ct', '--', relPath]).split('\n').filter(Boolean)) {
		const [sha, seconds] = line.split(' ');
		let blob;
		try {
			blob = git(repoRoot, ['rev-parse', `${sha}:${relPath}`]);
		} catch {
			continue;
		}
		if (blob === current) earliest = Number(seconds) * 1000;
	}
	return earliest;
}
