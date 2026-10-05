const QUERY_METHODS = new Set([
  'select',
  'selectDistinct',
  'selectDistinctOn',
  'insert',
  'update',
  'delete',
  'execute',
  'query',
  'with',
  '$with',
  '$count',
  'refreshMaterializedView',
]);

const DRIVER_SOURCE = /^(drizzle-orm|pg|postgres|@neondatabase\/serverless)(\/|$)/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Queries live in packages/db repositories, behind a TenantContext.' },
    schema: [
      {
        type: 'object',
        properties: { objects: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      query: '`{{object}}.{{method}}` is a raw query. Add a repository method in packages/db.',
      driver: '`{{source}}` is imported only inside packages/db. Call a repository instead.',
    },
  },
  create(context) {
    const objects = new Set(context.options[0]?.objects ?? ['db', 'tx', 'trx']);
    return {
      MemberExpression(node) {
        if (node.object.type !== 'Identifier' || !objects.has(node.object.name)) return;
        const method = node.property.type === 'Identifier' && !node.computed ? node.property.name : null;
        if (method && QUERY_METHODS.has(method)) {
          context.report({ node, messageId: 'query', data: { object: node.object.name, method } });
        }
      },
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;
        const source = String(node.source.value);
        if (DRIVER_SOURCE.test(source)) context.report({ node, messageId: 'driver', data: { source } });
      },
    };
  },
};
