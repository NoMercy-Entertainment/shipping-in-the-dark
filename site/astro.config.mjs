import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkGfm from 'remark-gfm';
import { remarkCallouts } from './src/lib/callout-remark.mjs';
import { rehypeRewriteLinks } from './src/lib/link-rehype.mjs';

export default defineConfig({
	site: 'https://journal.nomercy.tv',
	output: 'static',
	integrations: [sitemap()],
	markdown: {
		remarkPlugins: [remarkGfm, remarkCallouts],
		rehypePlugins: [rehypeRewriteLinks],
		shikiConfig: {
			themes: {
				light: 'github-light',
				dark: 'github-dark',
			},
		},
	},
});
