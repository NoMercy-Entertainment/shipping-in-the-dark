import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contentCommittedAtMs } from './git-content-time.mjs';

let repo;
const git = (args, date) => execFileSync('git', args, {
	cwd: repo,
	env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
	stdio: 'pipe',
});
const commit = (text, date) => {
	fs.writeFileSync(path.join(repo, 'entry.md'), text);
	git(['add', 'entry.md'], date);
	git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', date], date);
};
const at = (date) => new Date(date).getTime();

beforeEach(() => {
	repo = fs.mkdtempSync(path.join(os.tmpdir(), 'content-time-'));
	git(['init', '-q'], '2026-01-01T00:00:00Z');
});
afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

test('text put back to what was narrated counts from when it first existed', () => {
	commit('narrated words\n', '2026-01-01T00:00:00Z');
	commit('a path rewritten\n', '2026-02-01T00:00:00Z');
	commit('narrated words\n', '2026-03-01T00:00:00Z');
	assert.equal(contentCommittedAtMs(repo, 'entry.md'), at('2026-01-01T00:00:00Z'));
});

test('a real wording change counts from the commit that made it', () => {
	commit('narrated words\n', '2026-01-01T00:00:00Z');
	commit('new words\n', '2026-02-01T00:00:00Z');
	assert.equal(contentCommittedAtMs(repo, 'entry.md'), at('2026-02-01T00:00:00Z'));
});

test('content not committed yet has no commit time', () => {
	commit('narrated words\n', '2026-01-01T00:00:00Z');
	fs.writeFileSync(path.join(repo, 'entry.md'), 'edited, not committed\n');
	assert.equal(contentCommittedAtMs(repo, 'entry.md'), null);
});
