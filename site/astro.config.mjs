import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkGfm from 'remark-gfm';
import { remarkCallouts } from './src/lib/callout-remark.mjs';
import { rehypeRewriteLinks } from './src/lib/link-rehype.mjs';
import { rehypeInlineCode } from './src/lib/inline-code-rehype.mjs';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
	site: 'https://journal.nomercy.tv',
	output: 'static',
	integrations: [sitemap()],
	markdown: {
		remarkPlugins: [remarkGfm, remarkCallouts],
		rehypePlugins: [
			rehypeRewriteLinks,
			rehypeInlineCode,
			rehypeSlug,
			[rehypeAutolinkHeadings, {
				behavior: 'wrap',
				properties: {
					className: ['heading-anchor'],
				},
			}],
		],
		shikiConfig: {
			themes: {
				light: 'one-light',
				dark: 'one-dark-pro',
			},
		},
	},
});
