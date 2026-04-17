import { cpSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const journalRoot = join(projectRoot, '..');

const collections = [
	{ src: join(journalRoot, 'entries'), dest: join(projectRoot, 'src', 'content', 'entries') },
	{ src: join(journalRoot, 'reports'), dest: join(projectRoot, 'src', 'content', 'reports') },
	// Agents are committed directly in site/src/content/agents/ — no copy needed
];

for (const { src, dest } of collections) {
	if (existsSync(dest)) {
		rmSync(dest, { recursive: true });
	}
	mkdirSync(dest, { recursive: true });
	cpSync(src, dest, { recursive: true });
}

console.log('Content collections copied successfully.');
