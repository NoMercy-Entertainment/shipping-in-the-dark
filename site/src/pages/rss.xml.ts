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
		customData: '<language>en-us</language>',
		items: entries.map((entry) => {
			let description: string;
			if (entry.data.excerpt) {
				description = entry.data.excerpt;
			} else {
				const parts: string[] = [];
				if (entry.data.series) {
					parts.push(`${entry.data.series.name}, Part ${entry.data.series.part}`);
				}
				if (entry.data.type) {
					const typeLabel = entry.data.type
						.replace(/-/g, ' ')
						.replace(/\b\w/g, (c) => c.toUpperCase());
					parts.push(typeLabel);
				}
				if (entry.data.reading_time_minutes) {
					parts.push(`${entry.data.reading_time_minutes} min read`);
				}
				description = parts.length > 0
					? `${entry.data.title} — ${parts.join(' · ')}`
					: entry.data.title;
			}

			return {
				title: entry.data.title,
				pubDate: entry.data.date,
				link: `/entry/${entry.data.slug}`,
				description,
			};
		}),
	});
}
