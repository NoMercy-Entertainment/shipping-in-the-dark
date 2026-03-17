import { visit } from 'unist-util-visit';

/**
 * Rehype plugin to add syntax-aware coloring to inline code elements.
 * Detects patterns like ClassName::method(), $variable, function(), etc.
 * and wraps them in spans with CSS classes for coloring.
 */
export function rehypeInlineCode() {
	return (tree) => {
		visit(tree, 'element', (node, index, parent) => {
			// Only target inline <code> — skip code inside <pre> (fenced blocks)
			if (node.tagName !== 'code') return;
			if (parent && parent.tagName === 'pre') return;

			// Get the text content
			const text = getTextContent(node);
			if (!text) return;

			// Try to detect and colorize known patterns
			const colorized = colorizeInlineCode(text);
			if (colorized) {
				node.children = [{ type: 'raw', value: colorized }];
			}
		});
	};
}

function getTextContent(node) {
	if (node.type === 'text') return node.value;
	if (node.children) return node.children.map(getTextContent).join('');
	return '';
}

function colorizeInlineCode(text) {
	// Constructor: new ClassName() or new ClassName(args)
	const newCtor = text.match(/^new\s+([A-Z]\w+)\(([^)]*)\)$/);
	if (newCtor) {
		const kw = `<span class="ic-punct">new </span>`;
		const cls = `<span class="ic-ctor">${newCtor[1]}</span>`;
		const args = newCtor[2]
			? `<span class="ic-punct">(</span><span class="ic-var">${newCtor[2]}</span><span class="ic-punct">)</span>`
			: `<span class="ic-punct">()</span>`;
		return `${kw}${cls}${args}`;
	}

	// PHP static method call: ClassName::method() or ClassName::CONSTANT
	const phpStatic = text.match(/^([A-Z]\w+)::(\w+)(\(\))?$/);
	if (phpStatic) {
		const cls = `<span class="ic-class">${phpStatic[1]}</span>`;
		const sep = `<span class="ic-punct">::</span>`;
		// Constructors and special methods get purple
		const isCtor = /^(callback|__construct|create|make|new|boot|register)$/i.test(phpStatic[2]);
		const method = phpStatic[3]
			? `<span class="${isCtor ? 'ic-ctor' : 'ic-method'}">${phpStatic[2]}</span><span class="ic-punct">()</span>`
			: `<span class="ic-const">${phpStatic[2]}</span>`;
		return `${cls}${sep}${method}`;
	}

	// PHP object method call: $object->method() or $object->property
	const phpArrow = text.match(/^(\$\w+)->(\w+)(\(\))?$/);
	if (phpArrow) {
		const obj = `<span class="ic-var">${phpArrow[1]}</span>`;
		const sep = `<span class="ic-punct">-></span>`;
		const method = phpArrow[3]
			? `<span class="ic-method">${phpArrow[2]}</span><span class="ic-punct">()</span>`
			: `<span class="ic-prop">${phpArrow[2]}</span>`;
		return `${obj}${sep}${method}`;
	}

	// PHP variable: $variableName
	const phpVar = text.match(/^\$\w+$/);
	if (phpVar) {
		return `<span class="ic-var">${text}</span>`;
	}

	// Chained method/property: object.method().another or namespace.Class
	const dotChain = text.match(/^[\w$]+(?:\.[\w$]+)+(?:\(\))?$/);
	if (dotChain) {
		const parts = text.split(/(\.\w+\(\)|\.\w+)/);
		return parts.map(part => {
			if (part.startsWith('.') && part.endsWith('()')) {
				return `<span class="ic-punct">.</span><span class="ic-method">${part.slice(1, -2)}</span><span class="ic-punct">()</span>`;
			}
			if (part.startsWith('.')) {
				return `<span class="ic-punct">.</span><span class="ic-prop">${part.slice(1)}</span>`;
			}
			if (part) {
				return /^[A-Z]/.test(part)
					? `<span class="ic-class">${part}</span>`
					: `<span class="ic-var">${part}</span>`;
			}
			return '';
		}).join('');
	}

	// Function call: functionName()
	const funcCall = text.match(/^(\w+)\(\)$/);
	if (funcCall) {
		return `<span class="ic-method">${funcCall[1]}</span><span class="ic-punct">()</span>`;
	}

	// Simple function with args hint: functionName(...)
	const funcArgs = text.match(/^(\w+)\(([^)]+)\)$/);
	if (funcArgs) {
		return `<span class="ic-method">${funcArgs[1]}</span><span class="ic-punct">(</span><span class="ic-var">${funcArgs[2]}</span><span class="ic-punct">)</span>`;
	}

	// JSON property path: "key_name" or snake_case identifiers that look like config keys
	// Skip these — they're fine as plain text

	// CLI commands starting with common prefixes
	const cliCmd = text.match(/^(git|npm|yarn|docker|php|dotnet|make|curl|ssh)\s+(.+)$/);
	if (cliCmd) {
		return `<span class="ic-method">${cliCmd[1]}</span> <span class="ic-var">${cliCmd[2]}</span>`;
	}

	// File paths or config values — leave as-is
	return null;
}
