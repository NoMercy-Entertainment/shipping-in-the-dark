import { visit } from 'unist-util-visit';

/**
 * Rehype plugin to add syntax-aware coloring to ALL inline code elements.
 * Every backtick-wrapped piece of code gets colored — nothing is left plain.
 * Uses One Dark Pro color palette.
 */
export function rehypeInlineCode() {
	return (tree) => {
		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'code') return;
			if (parent && parent.tagName === 'pre') return;

			const text = getTextContent(node);
			if (!text || text.length === 0) return;

			const colorized = colorizeInlineCode(text);
			node.children = [{ type: 'raw', value: colorized }];
		});
	};
}

function getTextContent(node) {
	if (node.type === 'text') return node.value;
	if (node.children) return node.children.map(getTextContent).join('');
	return '';
}

function esc(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function span(cls, content) {
	return `<span class="${cls}">${esc(content)}</span>`;
}

function spanRaw(cls, content) {
	return `<span class="${cls}">${content}</span>`;
}

function colorizeInlineCode(text) {
	// === Compound patterns (try specific patterns first) ===

	// JSON object: {"key":"value"}
	if (text.startsWith('{') && text.endsWith('}')) {
		return tokenizeGeneric(text);
	}

	// Constructor: new ClassName()
	const newCtor = text.match(/^new\s+([A-Z]\w+)\(([^)]*)\)$/);
	if (newCtor) {
		return span('ic-kw', 'new') + ' ' + span('ic-ctor', newCtor[1]) +
			span('ic-punct', '(') + (newCtor[2] ? span('ic-var', newCtor[2]) : '') + span('ic-punct', ')');
	}

	// PHP static: Class::method() or Class::CONSTANT
	const phpStatic = text.match(/^([A-Z]\w*)::(\w+)(\(([^)]*)\))?$/);
	if (phpStatic) {
		const isCtor = /^(callback|__construct|create|make|new|boot|register|before|after)$/i.test(phpStatic[2]);
		const isConst = !phpStatic[3] && /^[A-Z_]+$/.test(phpStatic[2]);
		let methodPart;
		if (phpStatic[3]) {
			const cls = isCtor ? 'ic-ctor' : 'ic-method';
			methodPart = span(cls, phpStatic[2]) + span('ic-punct', '(') +
				(phpStatic[4] ? colorizeArgs(phpStatic[4]) : '') + span('ic-punct', ')');
		} else if (isConst) {
			methodPart = span('ic-const', phpStatic[2]);
		} else {
			methodPart = span('ic-prop', phpStatic[2]);
		}
		return span('ic-class', phpStatic[1]) + span('ic-punct', '::') + methodPart;
	}

	// PHP chained: $obj->method()->another() or $obj->prop
	if (text.startsWith('$') && text.includes('->')) {
		return colorizePhpChain(text);
	}

	// PHP variable: $variableName
	if (/^\$\w+$/.test(text)) {
		return span('ic-var', text);
	}

	// Vue/Angular directive: @click="handler" or v-html or :prop
	if (/^[@:v-]/.test(text) || text.startsWith('@')) {
		return colorizeDirective(text);
	}

	// Event name: update:open(false) or similar
	const eventCall = text.match(/^([\w:.-]+)\(([^)]*)\)$/);
	if (eventCall && text.includes(':')) {
		return span('ic-prop', eventCall[1]) + span('ic-punct', '(') +
			colorizeValue(eventCall[2]) + span('ic-punct', ')');
	}

	// Dotted path: resource_access.nomercy-api.roles or object.property
	if (/^[\w$-]+(?:\.[\w$-]+)+$/.test(text) && !text.includes('/')) {
		return colorizeDotPath(text);
	}

	// Chained with dots and calls: object.method().prop
	if (/^[\w$]+(?:\.[\w$]+(?:\([^)]*\))?)+$/.test(text)) {
		return colorizeDotPath(text);
	}

	// Function call: name() or name(args)
	const funcCall = text.match(/^(\w+)\(([^)]*)\)$/);
	if (funcCall) {
		return span('ic-method', funcCall[1]) + span('ic-punct', '(') +
			(funcCall[2] ? colorizeArgs(funcCall[2]) : '') + span('ic-punct', ')');
	}

	// CLI command: git add ., docker compose build, php artisan down, etc.
	const cliCmd = text.match(/^(git|npm|yarn|docker|php|dotnet|make|curl|ssh|chown|chmod)\s+(.+)$/);
	if (cliCmd) {
		return span('ic-method', cliCmd[1]) + ' ' + colorizeCliArgs(cliCmd[2]);
	}

	// File path: ./data/ or public/build/ or /var/www/html or *.js
	if (/[/\\.]/.test(text) && /^[.\w@/_\\*{}-]+$/.test(text)) {
		return colorizeFilePath(text);
	}

	// PascalCase class/component name: AlertDialog, ConfirmDialog, SyncKeycloakUsersJob
	if (/^[A-Z][a-zA-Z0-9]+(?:[A-Z][a-zA-Z0-9]*)+$/.test(text)) {
		return span('ic-class', text);
	}

	// UPPER_CASE constant: COMPOSITE_ROLES
	if (/^[A-Z][A-Z0-9_]+$/.test(text)) {
		return span('ic-const', text);
	}

	// snake_case identifier: keycloak_roles, database-uuids
	if (/^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/.test(text)) {
		return span('ic-var', text);
	}

	// Boolean/null/keyword: true, false, null
	if (/^(true|false|null|undefined|nil|none|void)$/i.test(text)) {
		return span('ic-const', text);
	}

	// Numeric value
	if (/^-?\d+(\.\d+)?$/.test(text)) {
		return span('ic-const', text);
	}

	// camelCase identifier: handleConfirm, resolvePromise
	if (/^[a-z][a-zA-Z0-9]+$/.test(text) && /[A-Z]/.test(text)) {
		return span('ic-var', text);
	}

	// Single PascalCase word: Teleport, MustBeAdmin
	if (/^[A-Z][a-zA-Z0-9]+$/.test(text)) {
		return span('ic-class', text);
	}

	// Quoted string content: 'admin:dashboard:read'
	if (/^['"].*['"]$/.test(text)) {
		return span('ic-str', text);
	}

	// Anything with special chars that looks like code
	if (/[{}()\[\]:;=<>|&!?#@$]/.test(text)) {
		return tokenizeGeneric(text);
	}

	// Short single word that's in backticks — it's code, color it as a generic identifier
	if (/^[a-z]\w*$/.test(text)) {
		return span('ic-var', text);
	}

	// Single uppercase word
	if (/^[A-Z]\w*$/.test(text)) {
		return span('ic-class', text);
	}

	// Fallback: tokenize whatever it is
	return tokenizeGeneric(text);
}

// === Helper colorizers ===

function colorizePhpChain(text) {
	// Split on -> but keep the parts
	const parts = text.split(/(->)/);
	return parts.map((part, i) => {
		if (part === '->') return span('ic-punct', '->');
		// First part is $variable
		if (i === 0 && part.startsWith('$')) return span('ic-var', part);
		// Method call
		const methodMatch = part.match(/^(\w+)\(([^)]*)\)$/);
		if (methodMatch) {
			return span('ic-method', methodMatch[1]) + span('ic-punct', '(') +
				(methodMatch[2] ? colorizeArgs(methodMatch[2]) : '') + span('ic-punct', ')');
		}
		// Property
		if (/^\w+$/.test(part)) return span('ic-prop', part);
		return esc(part);
	}).join('');
}

function colorizeDirective(text) {
	// @click="handleConfirm" or @update:open or v-html
	const attrMatch = text.match(/^([@:v-][\w:.-]+)(?:="([^"]*)")?$/);
	if (attrMatch) {
		let result = span('ic-prop', attrMatch[1]);
		if (attrMatch[2] !== undefined) {
			result += span('ic-punct', '=') + span('ic-str', '"' + attrMatch[2] + '"');
		}
		return result;
	}
	return span('ic-prop', text);
}

function colorizeDotPath(text) {
	const parts = text.split(/(\.|(?:\([^)]*\)))/);
	return parts.map(part => {
		if (part === '.') return span('ic-punct', '.');
		if (part.startsWith('(') && part.endsWith(')')) {
			return span('ic-punct', '(') + colorizeValue(part.slice(1, -1)) + span('ic-punct', ')');
		}
		if (/^[A-Z]/.test(part)) return span('ic-class', part);
		if (/^[a-z]/.test(part) || part.startsWith('$')) return span('ic-prop', part);
		return esc(part);
	}).join('');
}

function colorizeArgs(text) {
	if (!text) return '';
	// Split by comma
	return text.split(/(\s*,\s*)/).map(arg => {
		if (/^\s*,\s*$/.test(arg)) return span('ic-punct', arg);
		return colorizeValue(arg.trim());
	}).join('');
}

function colorizeValue(text) {
	if (!text) return '';
	if (/^['"]/.test(text)) return span('ic-str', text);
	if (/^(true|false|null|undefined)$/i.test(text)) return span('ic-const', text);
	if (/^\d+/.test(text)) return span('ic-const', text);
	if (text.startsWith('$')) return span('ic-var', text);
	if (/^[A-Z]/.test(text)) return span('ic-class', text);
	return span('ic-var', text);
}

function colorizeFilePath(text) {
	// Color file paths: directory separators as punctuation, extension as type, name as string
	return text.split(/([/\\])/).map(part => {
		if (part === '/' || part === '\\') return span('ic-punct', part);
		// File with extension
		const extMatch = part.match(/^(.+?)(\.\w+)$/);
		if (extMatch) {
			return span('ic-str', extMatch[1]) + span('ic-class', extMatch[2]);
		}
		if (part === '.' || part === '..') return span('ic-punct', part);
		return span('ic-str', part);
	}).join('');
}

function colorizeCliArgs(text) {
	return text.split(/(\s+)/).map(part => {
		if (/^\s+$/.test(part)) return part;
		if (part.startsWith('--') || part.startsWith('-')) return span('ic-prop', part);
		if (part.startsWith("'") || part.startsWith('"')) return span('ic-str', part);
		if (/^[A-Z]/.test(part)) return span('ic-class', part);
		return span('ic-var', part);
	}).join('');
}

function tokenizeGeneric(text) {
	// Break into tokens and color each one
	const tokens = text.split(/([{}()\[\]:;=<>|&!?,."'\s@#$]+)/);
	return tokens.map(token => {
		if (!token) return '';
		// Punctuation/operators
		if (/^[{}()\[\]:;=<>|&!?,."'\s@#$]+$/.test(token)) return span('ic-punct', token);
		// Keywords
		if (/^(true|false|null|undefined|new|return|const|let|var|function|class|if|else)$/i.test(token)) return span('ic-kw', token);
		// Numbers
		if (/^\d+/.test(token)) return span('ic-const', token);
		// PascalCase
		if (/^[A-Z][a-zA-Z]+/.test(token)) return span('ic-class', token);
		// Variables/identifiers
		return span('ic-var', token);
	}).join('');
}
