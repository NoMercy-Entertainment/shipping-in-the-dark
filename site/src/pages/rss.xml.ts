import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
	const entries = (await getCollection('entries')).sort(
		(a, b) => b.data.date.getTime() - a.data.date.getTime()
	);

	return rss({
		title: 'Shipping in the Dark',
		description: 'The honest journal of a solo developer building something that matters.',
		site: context.site!,
		items: entries.map((entry) => ({
			title: entry.data.title,
			pubDate: entry.data.date,
			link: `/entry/${entry.data.slug}`,
			description: `${entry.data.series ? `${entry.data.series.name} Part ${entry.data.series.part} — ` : ''}${entry.data.reading_time_minutes || '?'} min read`,
		})),
	});
}
