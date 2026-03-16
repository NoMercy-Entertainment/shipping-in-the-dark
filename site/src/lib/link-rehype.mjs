import { visit } from 'unist-util-visit';

export function rehypeRewriteLinks() {
	return (tree) => {
		visit(tree, 'element', (node) => {
			if (node.tagName !== 'a' || !node.properties?.href) return;

			let href = node.properties.href;

			// Rewrite agent links: ../agents/auth-specialist.md -> /team/auth-specialist
			const agentMatch = href.match(/\.\.\/agents\/([^.]+)\.md$/);
			if (agentMatch) {
				node.properties.href = `/team/${agentMatch[1]}`;
				node.properties['data-agent'] = agentMatch[1];
				node.properties.className = [...(node.properties.className || []), 'agent-link'];
				return;
			}

			// Rewrite entry links: ../entries/2026-03-16-001-slug -> /entry/slug
			const entryMatch = href.match(/\.\.\/entries\/\d{4}-\d{2}-\d{2}-\d{3}-(.+?)(?:\.md)?$/);
			if (entryMatch) {
				node.properties.href = `/entry/${entryMatch[1]}`;
				return;
			}
		});
	};
}
