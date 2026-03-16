import { visit } from 'unist-util-visit';

export function remarkCallouts() {
	return (tree) => {
		const nodesToProcess = [];

		visit(tree, 'html', (node, index, parent) => {
			if (!node.value || !node.value.includes('@callout')) return;

			const match = node.value.match(/<!--@callout\s+type="(\w+)"/);
			if (!match) return;

			const type = match[1];

			// Find the closing --> which is the end of the same HTML comment block
			// The content is between the @callout line and -->
			const content = node.value
				.replace(/<!--@callout\s+type="\w+"/, '')
				.replace(/-->$/, '')
				.trim();

			if (content) {
				nodesToProcess.push({ node, index, parent, type, content });
			}
		});

		// Process in reverse to maintain indices
		for (let i = nodesToProcess.length - 1; i >= 0; i--) {
			const { node, index, parent, type, content } = nodesToProcess[i];

			const iconMap = {
				info: 'ℹ️',
				warning: '⚠️',
				danger: '🚨',
			};

			const colorMap = {
				info: 'callout-info',
				warning: 'callout-warning',
				danger: 'callout-danger',
			};

			const replacement = {
				type: 'html',
				value: `<aside class="callout ${colorMap[type] || 'callout-info'}" role="note">
<p class="callout-icon">${iconMap[type] || 'ℹ️'}</p>
<div class="callout-content">

${content}

</div>
</aside>`,
			};

			parent.children.splice(index, 1, replacement);
		}
	};
}
