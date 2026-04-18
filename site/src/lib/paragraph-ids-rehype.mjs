import { visit } from 'unist-util-visit';

/**
 * Rehype plugin that adds sequential id attributes to prose elements
 * inside the rendered markdown body.
 *
 * ID schemes:
 *   p-1, p-2, ...   → <p> elements (paragraphs)
 *   h-1, h-2, ...   → <h2>, <h3>, <h4> elements (headings)
 *   i-1, i-2, ...   → <img> elements (images)
 *
 * Elements that already carry an id are skipped (headings often have
 * auto-generated slugs). Their slot in the sequence is still consumed
 * so downstream numbering stays stable.
 *
 * These IDs are the stable anchors used by AudioSync for deterministic
 * highlighting — VTT cues reference them directly.
 */
export default function rehypeParagraphIds() {
	return (tree) => {
		var pCounter = 0;
		var hCounter = 0;
		var iCounter = 0;
		var cCounter = 0;

		visit(tree, 'element', (node) => {
			if (node.tagName === 'p') {
				pCounter++;
				if (node.properties && node.properties.id) return;
				if (!node.properties) node.properties = {};
				node.properties.id = 'p-' + pCounter;
			} else if (/^h[2-4]$/.test(node.tagName)) {
				hCounter++;
				if (!node.properties) node.properties = {};
				node.properties.id = node.properties.id || ('h-' + hCounter);
				node.properties.dataAudioH = 'h-' + hCounter;
			} else if (node.tagName === 'img') {
				iCounter++;
				if (!node.properties) node.properties = {};
				node.properties.dataAudioI = 'i-' + iCounter;
			} else if (node.tagName === 'pre') {
				cCounter++;
				if (!node.properties) node.properties = {};
				node.properties.dataAudioCode = 'code-' + cCounter;
			}
		});
	};
}
