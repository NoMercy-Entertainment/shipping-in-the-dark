import { getCollection } from 'astro:content';

/**
 * Derive sessions_involved for each agent by counting journal entries
 * that list them in the `agents` frontmatter array.
 */
export async function getAgentSessionCounts(): Promise<Record<string, number>> {
	const entries = await getCollection('entries');
	const counts: Record<string, number> = {};

	for (const entry of entries) {
		const agents = entry.data.agents ?? [];
		for (const agent of agents) {
			counts[agent] = (counts[agent] ?? 0) + 1;
		}
	}

	return counts;
}
