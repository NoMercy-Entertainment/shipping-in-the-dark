import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
	const agents = await getCollection('agents');
	const manifest: Record<string, {
		displayName: string;
		fullTitle: string;
		tagline: string;
		avatarEmoji: string;
		model: string;
		pronouns: string;
	}> = {};

	for (const agent of agents) {
		manifest[agent.data.id] = {
			displayName: agent.data.display_name,
			fullTitle: agent.data.full_title,
			tagline: agent.data.tagline,
			avatarEmoji: agent.data.avatar_emoji,
			model: agent.data.model,
			pronouns: agent.data.pronouns,
		};
	}

	return new Response(JSON.stringify(manifest), {
		headers: { 'Content-Type': 'application/json' },
	});
};
