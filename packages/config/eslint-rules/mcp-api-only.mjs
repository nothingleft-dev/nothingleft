const FORBIDDEN =
  /^((@nothingleft\/(db|analytics|api)|drizzle-orm|pg|postgres|ioredis|@neondatabase\/serverless)(\/|$)|@(services|routes|middleware|plugins|lib|config)\/)/;
const INTO_API = /(^|\/)apps\/api(\/|$)|^(\.\.\/)+(apps|api)\//;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'The MCP server is a client of the public REST API: no database, service or API-internal import.',
    },
    schema: [],
    messages: {
      forbidden:
        '`{{source}}` reaches past the REST API. MCP tools call the API over HTTP; if the API lacks the capability, add it there.',
    },
  },
  create(context) {
    const check = (node, source) => {
      if (typeof source !== 'string') return;
      if (FORBIDDEN.test(source) || INTO_API.test(source)) {
        context.report({ node, messageId: 'forbidden', data: { source } });
      }
    };
    return {
      ImportDeclaration: node => check(node, node.source.value),
      ExportNamedDeclaration: node => node.source && check(node, node.source.value),
      ExportAllDeclaration: node => check(node, node.source.value),
      ImportExpression: node => node.source.type === 'Literal' && check(node, node.source.value),
      CallExpression: node => {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments[0]?.type === 'Literal'
        ) {
          check(node, node.arguments[0].value);
        }
      },
    };
  },
};
