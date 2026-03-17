import { visit } from 'unist-util-visit';

/**
 * Rehype plugin that adds sequential id attributes to all <p> elements
 * inside the rendered markdown body.
 *
 * IDs are 1-indexed: p-1, p-2, p-3, ...
 * Paragraphs that already carry an id are skipped (their slot in the
 * sequence is still consumed so downstream numbering stays stable).
 *
 * These IDs are the stable anchors used by AudioSync for deterministic
 * paragraph highlighting — VTT cues reference them directly instead of
 * relying on fuzzy text matching.
 */
export default function rehypeParagraphIds() {
	return (tree) => {
		var counter = 0;

		visit(tree, 'element', (node) => {
			if (node.tagName !== 'p') return;

			counter++;

			// Skip paragraphs that already have an id (respect existing markup)
			if (node.properties && node.properties.id) return;

			if (!node.properties) node.properties = {};
			node.properties.id = 'p-' + counter;
		});
	};
}
