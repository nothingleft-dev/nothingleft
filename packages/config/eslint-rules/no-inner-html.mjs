const HTML_PROPERTIES = new Set(['innerHTML', 'outerHTML']);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Only the sanitised markdown renderer in components/markdown/ writes HTML.' },
    schema: [],
    messages: {
      html: '`{{name}}` writes unsanitised HTML. Render markdown through components/markdown/.',
    },
  },
  create(context) {
    const report = (node, name) => context.report({ node, messageId: 'html', data: { name } });
    const propertyName = node =>
      node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier'
        ? node.property.name
        : null;
    return {
      JSXAttribute(node) {
        if (node.name.type === 'JSXIdentifier' && node.name.name === 'dangerouslySetInnerHTML') {
          report(node, 'dangerouslySetInnerHTML');
        }
      },
      Property(node) {
        if (node.key.type === 'Identifier' && node.key.name === 'dangerouslySetInnerHTML' && !node.computed) {
          report(node, 'dangerouslySetInnerHTML');
        }
      },
      AssignmentExpression(node) {
        const name = propertyName(node.left);
        if (name && HTML_PROPERTIES.has(name)) report(node, name);
      },
      CallExpression(node) {
        if (propertyName(node.callee) === 'insertAdjacentHTML') report(node, 'insertAdjacentHTML');
      },
    };
  },
};
