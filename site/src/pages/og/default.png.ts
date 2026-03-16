import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fontsDir = join(process.cwd(), 'src/fonts');

const fontBold = readFileSync(join(fontsDir, 'atkinson-hyperlegible-700.woff'));
const fontRegular = readFileSync(join(fontsDir, 'atkinson-hyperlegible-400.woff'));

const BG = '#1c1c21';
const TEXT_50 = '#fafafa';
const TEXT_400 = '#a0a0a8';
const ACCENT = '#4ade80';

export const GET: APIRoute = async () => {
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
					alignItems: 'center',
					justifyContent: 'center',
					textAlign: 'center',
				},
				children: [
					{
						type: 'div',
						props: {
							style: { fontSize: '80px', marginBottom: '24px' },
							children: '🌙',
						},
					},
					{
						type: 'div',
						props: {
							style: {
								fontSize: '56px',
								fontWeight: 700,
								color: TEXT_50,
								lineHeight: '1.2',
								marginBottom: '16px',
							},
							children: 'Shipping in the Dark',
						},
					},
					{
						type: 'div',
						props: {
							style: {
								fontSize: '24px',
								color: TEXT_400,
								maxWidth: '700px',
								lineHeight: '1.5',
							},
							children: 'One developer. 32 AIs. Eight years. A fight for media ownership.',
						},
					},
					{
						type: 'div',
						props: {
							style: {
								marginTop: '40px',
								fontSize: '16px',
								color: ACCENT,
								fontWeight: 700,
								letterSpacing: '0.05em',
							},
							children: 'journal.nomercy.tv',
						},
					},
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
			loadAdditionalAsset: async (languageCode: string, segment: string) => {
				if (languageCode === 'emoji') {
					const codePoint = segment.codePointAt(0)?.toString(16);
					if (!codePoint) return '';
					const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codePoint}.svg`;
					const response = await fetch(url);
					if (!response.ok) return '';
					const svgText = await response.text();
					return `data:image/svg+xml;base64,${Buffer.from(svgText).toString('base64')}`;
				}
				return '';
			},
		},
	);

	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: 1200 },
		font: { loadSystemFonts: false },
	});
	const png = resvg.render().asPng();

	return new Response(png, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
