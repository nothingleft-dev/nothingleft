const LOG_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'log']);
const PASS_THROUGH = new Set([
  'TemplateLiteral',
  'BinaryExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'ArrayExpression',
  'SpreadElement',
]);

// Heuristic: two or more words that either open with a capitalised word or close with
// sentence punctuation. Codes, keys, scopes, SQL-ish fragments and lowercase log lines pass.
export function looksLikeProse(text) {
  const trimmed = text.trim();
  if (!/[A-Za-z]{2,}\S*\s+\S*[A-Za-z]/.test(trimmed)) return false;
  return /^[A-Z][a-z']*\b/.test(trimmed) || /[a-z)][.!?]$/.test(trimmed);
}

const staticText = node =>
  node.type === 'Literal' ? String(node.value) : node.quasis.map(q => q.value.cooked ?? q.value.raw).join(' ');

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'A message a user can read resolves from packages/i18n/en.json.' },
    schema: [
      {
        type: 'object',
        properties: { allowCallees: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      literal: 'User-facing text belongs in packages/i18n/en.json; resolve it with t(key) or throw an AppError.',
    },
  },
  create(context) {
    const allowCallees = new Set(context.options[0]?.allowCallees ?? ['systemContext']);

    const calleeIsExempt = call => {
      const callee = call.callee;
      if (callee.type === 'Identifier') {
        if (allowCallees.has(callee.name)) return true;
        return call.type === 'NewExpression' && /Error$/.test(callee.name) && callee.name !== 'AppError';
      }
      return (
        call.type === 'CallExpression' &&
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        LOG_METHODS.has(callee.property.name)
      );
    };

    const isExempt = node => {
      let child = node;
      let parent = node.parent;
      while (parent && PASS_THROUGH.has(parent.type)) {
        child = parent;
        parent = parent.parent;
      }
      if (!parent) return false;
      switch (parent.type) {
        case 'ImportDeclaration':
        case 'ExportNamedDeclaration':
        case 'ExportAllDeclaration':
        case 'ImportExpression':
        case 'TSLiteralType':
        case 'TSExternalModuleReference':
        case 'TSEnumMember':
          return true;
        case 'Property':
        case 'PropertyDefinition':
        case 'MethodDefinition':
          return parent.key === child && !parent.computed;
        case 'ExpressionStatement':
          return Boolean(parent.directive);
        case 'CallExpression':
        case 'NewExpression':
          return parent.arguments.includes(child) && calleeIsExempt(parent);
        default:
          return false;
      }
    };

    const check = node => {
      if (node.type === 'Literal' && typeof node.value !== 'string') return;
      if (node.type === 'TemplateLiteral' && node.parent.type === 'TaggedTemplateExpression') return;
      if (node.type === 'Literal' && node.parent.type === 'TemplateLiteral') return;
      if (!looksLikeProse(staticText(node)) || isExempt(node)) return;
      context.report({ node, messageId: 'literal' });
    };

    return { Literal: check, TemplateLiteral: check };
  },
};
