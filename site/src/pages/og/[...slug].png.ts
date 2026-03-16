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

// oklch(0.141 0.005 285.823) ≈ #1c1c21
const BG = '#1c1c21';
const SURFACE_800 = '#38383f';
const SURFACE_700 = '#4a4a52';
const TEXT_50 = '#fafafa';
const TEXT_400 = '#a0a0a8';
const TEXT_500 = '#74747c';
const ACCENT = '#4ade80'; // oklch(0.765 0.177 163.223) ≈ green-400

const agentEmojis: Record<string, string> = {
	'arc': '🧠',
	'auth-specialist': '🔐',
	'web-frontend-engineer': '🖥️',
	'web-designer': '🎨',
	'server-dotnet-engineer': '⚙️',
	'server-database-specialist': '🗄️',
	'server-api-specialist': '🔌',
	'android-frontend-engineer': '📱',
	'android-designer': '🎨',
	'devops-engineer': '🚀',
	'secops-engineer': '🛡️',
	'code-quality-enforcer': '🔍',
	'docs-specialist': '📝',
	'a11y-specialist': '🔦',
	'i18n-specialist': '🌍',
	'cfo': '💰',
	'git-specialist': '🌿',
	'testing-specialist': '🧪',
	'performance-specialist': '⚡',
	'migration-specialist': '🔄',
	'release-coordinator': '📦',
	'network-sentinel': '🌐',
	'privacy-compliance': '🔒',
	'distribution-specialist': '📤',
	'php-static-analysis': '🐘',
	'productivity-manager': '📊',
	'website-backend-engineer': '🏗️',
	'website-frontend-engineer': '💻',
	'website-designer': '✏️',
	'video-player-specialist': '🎬',
	'music-player-specialist': '🎵',
	'library-manager': '📚',
};

function wrapText(text: string, maxLen: number): string[] {
	const words = text.split(' ');
	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		if ((current + ' ' + word).trim().length <= maxLen) {
			current = (current + ' ' + word).trim();
		} else {
			if (current) lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

function formatDate(date: Date): string {
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	});
}

export const GET: APIRoute = async ({ props }) => {
	const { entry } = props as { entry: Awaited<ReturnType<typeof getCollection<'entries'>>>[0] };

	const titleLines = wrapText(entry.data.title, 38);
	const dateStr = formatDate(entry.data.date);
	const readingTime = entry.data.reading_time_minutes;
	const series = entry.data.series;
	const agents = (entry.data.agents ?? []).slice(0, 6);

	const subtitleParts: string[] = [dateStr];
	if (readingTime) subtitleParts.push(`${readingTime} min read`);

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
					padding: '60px',
					fontFamily: 'Atkinson',
					position: 'relative',
				},
				children: [
					// Top bar — moon + wordmark
					{
						type: 'div',
						props: {
							style: {
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								marginBottom: '40px',
							},
							children: [
								{
									type: 'div',
									props: {
										style: {
											display: 'flex',
											alignItems: 'center',
											gap: '12px',
										},
										children: [
											{
												type: 'span',
												props: {
													style: { fontSize: '28px' },
													children: '🌙',
												},
											},
											{
												type: 'span',
												props: {
													style: {
														fontSize: '18px',
														color: ACCENT,
														fontWeight: 700,
														letterSpacing: '0.02em',
													},
													children: 'Shipping in the Dark',
												},
											},
										],
									},
								},
								// Series badge if present
								series
									? {
											type: 'div',
											props: {
												style: {
													background: ACCENT + '1a',
													color: ACCENT,
													borderRadius: '9999px',
													padding: '6px 16px',
													fontSize: '14px',
													fontWeight: 700,
												},
												children: `${series.name} · Part ${series.part}`,
											},
										}
									: { type: 'span', props: { style: {}, children: '' } },
							],
						},
					},

					// Title block — takes remaining space
					{
						type: 'div',
						props: {
							style: {
								display: 'flex',
								flexDirection: 'column',
								flex: 1,
								justifyContent: 'center',
							},
							children: titleLines.map((line, i) => ({
								type: 'div',
								props: {
									style: {
										fontSize: titleLines.length > 2 ? '44px' : '52px',
										fontWeight: 700,
										color: TEXT_50,
										lineHeight: '1.2',
										marginBottom: i < titleLines.length - 1 ? '4px' : '0',
									},
									children: line,
								},
							})),
						},
					},

					// Bottom row — date + agents
					{
						type: 'div',
						props: {
							style: {
								display: 'flex',
								alignItems: 'flex-end',
								justifyContent: 'space-between',
								marginTop: '40px',
							},
							children: [
								// Date / reading time
								{
									type: 'div',
									props: {
										style: {
											display: 'flex',
											flexDirection: 'column',
											gap: '4px',
										},
										children: [
											{
												type: 'span',
												props: {
													style: {
														fontSize: '16px',
														color: TEXT_400,
													},
													children: subtitleParts.join('  ·  '),
												},
											},
										],
									},
								},

								// Agent emoji row
								agents.length > 0
									? {
											type: 'div',
											props: {
												style: {
													display: 'flex',
													gap: '6px',
												},
												children: agents.map((agentId: string) => ({
													type: 'div',
													props: {
														style: {
															width: '40px',
															height: '40px',
															borderRadius: '50%',
															background: SURFACE_800,
															display: 'flex',
															alignItems: 'center',
															justifyContent: 'center',
															fontSize: '20px',
														},
														children: agentEmojis[agentId] ?? '🤖',
													},
												})),
											},
										}
									: { type: 'span', props: { style: {}, children: '' } },
							],
						},
					},

					// Accent bar at very bottom
					{
						type: 'div',
						props: {
							style: {
								position: 'absolute',
								bottom: '0',
								left: '0',
								right: '0',
								height: '4px',
								background: ACCENT,
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
	const entries = await getCollection('entries');
	return entries.map((entry) => ({
		params: { slug: entry.data.slug },
		props: { entry },
	}));
}
