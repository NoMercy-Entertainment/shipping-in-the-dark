import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// process.cwd() is the project root — consistent at both dev and build time
const fontsDir = join(process.cwd(), 'src/fonts');

const fontBold = readFileSync(join(fontsDir, 'atkinson-hyperlegible-700.woff'));
const fontRegular = readFileSync(join(fontsDir, 'atkinson-hyperlegible-400.woff'));

const BG = '#1c1c21';
const SURFACE_800 = '#38383f';
const TEXT_50 = '#fafafa';
const TEXT_400 = '#a0a0a8';
const ACCENT = '#4ade80';

const modelColors: Record<string, string> = {
	opus: '#a855f7',
	sonnet: '#38bdf8',
	haiku: '#34d399',
	human: '#fbbf24',
};

const modelLabels: Record<string, string> = {
	opus: 'Claude Opus',
	sonnet: 'Claude Sonnet',
	haiku: 'Claude Haiku',
	human: 'Human',
};

export const GET: APIRoute = async ({ props }) => {
	const { agent } = props as { agent: Awaited<ReturnType<typeof getCollection<'agents'>>>[0] };

	const modelColor = modelColors[agent.data.model] ?? modelColors.sonnet;
	const modelLabel = modelLabels[agent.data.model] ?? agent.data.model;

	// Truncate tagline if too long
	const tagline =
		agent.data.tagline.length > 80
			? agent.data.tagline.slice(0, 77) + '...'
			: agent.data.tagline;

	const svg = await satori(
		{
			type: 'div',
			props: {
				style: {
					display: 'flex',
					flexDirection: 'column',
					width: '100%',
					height: '100%',
					background: BG,
					fontFamily: 'Atkinson',
					position: 'relative',
				},
				children: [
					// Top wordmark bar
					{
						type: 'div',
						props: {
							style: {
								display: 'flex',
								alignItems: 'center',
								gap: '12px',
								padding: '40px 60px 0',
							},
							children: [
								{
									type: 'span',
									props: {
										style: { fontSize: '24px' },
										children: '🌙',
									},
								},
								{
									type: 'span',
									props: {
										style: {
											fontSize: '16px',
											color: ACCENT,
											fontWeight: 700,
											letterSpacing: '0.02em',
										},
										children: 'Shipping in the Dark',
									},
								},
								{
									type: 'span',
									props: {
										style: {
											fontSize: '14px',
											color: TEXT_400,
											marginLeft: '8px',
										},
										children: '— Meet the Team',
									},
								},
							],
						},
					},

					// Center content
					{
						type: 'div',
						props: {
							style: {
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								justifyContent: 'center',
								flex: 1,
								padding: '0 80px',
								textAlign: 'center',
							},
							children: [
								// Avatar emoji in circle
								{
									type: 'div',
									props: {
										style: {
											width: '120px',
											height: '120px',
											borderRadius: '50%',
											background: SURFACE_800,
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											fontSize: '64px',
											marginBottom: '28px',
											border: `3px solid ${modelColor}40`,
										},
										children: agent.data.avatar_emoji,
									},
								},

								// Display name
								{
									type: 'div',
									props: {
										style: {
											fontSize: '52px',
											fontWeight: 700,
											color: TEXT_50,
											marginBottom: '8px',
											lineHeight: '1.1',
										},
										children: agent.data.display_name,
									},
								},

								// Full title
								{
									type: 'div',
									props: {
										style: {
											fontSize: '18px',
											color: TEXT_400,
											marginBottom: '24px',
										},
										children: agent.data.full_title,
									},
								},

								// Tagline in quotes
								agent.data.tagline
									? {
											type: 'div',
											props: {
												style: {
													fontSize: '20px',
													color: TEXT_400,
													fontStyle: 'italic',
													maxWidth: '800px',
													lineHeight: '1.5',
												},
												children: `"${tagline}"`,
											},
										}
									: { type: 'span', props: { style: {}, children: '' } },

								// Model badge
								{
									type: 'div',
									props: {
										style: {
											marginTop: '28px',
											background: modelColor + '26',
											color: modelColor,
											borderRadius: '9999px',
											padding: '8px 20px',
											fontSize: '15px',
											fontWeight: 700,
										},
										children: modelLabel,
									},
								},
							],
						},
					},

					// Bottom accent bar
					{
						type: 'div',
						props: {
							style: {
								position: 'absolute',
								bottom: '0',
								left: '0',
								right: '0',
								height: '4px',
								background: modelColor,
							},
							children: '',
						},
					},
				],
			},
		},
		{
			width: 1200,
			height: 630,
			fonts: [
				{
					name: 'Atkinson',
					data: fontRegular.buffer as ArrayBuffer,
					weight: 400,
					style: 'normal',
				},
				{
					name: 'Atkinson',
					data: fontBold.buffer as ArrayBuffer,
					weight: 700,
					style: 'normal',
				},
			],
		},
	);

	const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
	const png = resvg.render().asPng();

	return new Response(png, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};

export async function getStaticPaths() {
	const agents = await getCollection('agents');
	return agents.map((agent) => ({
		params: { slug: agent.data.id },
		props: { agent },
	}));
}
