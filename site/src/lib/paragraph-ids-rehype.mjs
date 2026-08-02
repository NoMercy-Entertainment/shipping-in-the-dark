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
 * A <li> is one narration "beat" no matter how many block-level children
 * it wraps. Loose lists (any blank line between items, e.g. a list item
 * that also carries a code sample) make remark wrap each item's own text
 * in a nested <p> — without this exclusion that inner <p> would consume
 * its own id right after the <li>'s, silently splitting one bullet into
 * two ids and leaving the speech script's one-cue-per-item narration
 * with nothing to reference for the second id.
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

		visit(tree, 'element', (node, index, parent) => {
			// A <p> that is a direct child of an <li> is the loose-list
			// wrapper described above — the <li> already claimed the id
			// for this beat, so skip the nested <p> entirely (no id, and
			// no slot consumed).
			if (node.tagName === 'p' && parent && parent.tagName === 'li') {
				return;
			}

			// A standalone `![alt](src)` on its own line becomes `<p><img></p>`
			// — a paragraph with no narratable text of its own, wrapping the
			// image that gets the real i-N id. Assigning this wrapper its own
			// p-N id used to cost that number a speech-script cue: the marker
			// for the image narration ("<!-- i-N -->") had to sit right after
			// this paragraph's marker with nothing spoken in between, and only
			// the last marker before a text segment ever becomes that
			// segment's cue id, so the p-N was silently swallowed. Not
			// assigning it here means there is nothing to swallow.
			if (
				node.tagName === 'p' &&
				node.children.filter((c) => !(c.type === 'text' && !c.value.trim())).length === 1 &&
				node.children.some((c) => c.type === 'element' && c.tagName === 'img')
			) {
				return;
			}

			// Treat <p> and top-level <li> as the same class of "prose block"
			// for narration alignment — markdown numbered and bulleted lists
			// become <li>, and the narration still wants to highlight each
			// item as its own beat. Nested <li> inside a nested list is fine:
			// the visit walks depth-first, so each gets its own number in
			// document order.
			if (node.tagName === 'p' || node.tagName === 'li') {
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
				// Astro's built-in image optimization regenerates <img> tags
				// from this hast node through its own asset pipeline, which
				// does not apply the camelCase-to-kebab-case attribute
				// conversion the standard rehype-to-html serializer does for
				// every other element (headings, <pre> blocks). A property
				// set as `dataAudioI` therefore reaches the page verbatim as
				// `dataAudioI`, not `data-audio-i` -- so
				// `[data-audio-i="..."]` never matches and every image cue
				// silently fails to highlight or seek. Setting the literal
				// hyphenated key sidesteps whichever pipeline renders it.
				node.properties['data-audio-i'] = 'i-' + iCounter;
			} else if (node.tagName === 'pre') {
				cCounter++;
				if (!node.properties) node.properties = {};
				node.properties.dataAudioCode = 'code-' + cCounter;
			}
		});
	};
}
