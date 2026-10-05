const GLOBALS = new Set(['fetch', 'XMLHttpRequest', 'EventSource']);
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
const LIBRARIES =
  /^(axios|ky|got|node-fetch|cross-fetch|isomorphic-fetch|undici|superagent|ofetch|redaxios|wretch)(\/|$)/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Every HTTP request goes through the one API client in apps/web/lib/api.' },
    schema: [],
    messages: {
      global: '`{{name}}` is used only inside lib/api. Add a resource function there and call it from a hook.',
      library: '`{{source}}` is not used; every request goes through lib/api/client.ts.',
    },
  },
  create(context) {
    const report = (node, name) => context.report({ node, messageId: 'global', data: { name } });
    return {
      MemberExpression(node) {
        if (node.object.type !== 'Identifier' || !GLOBAL_OBJECTS.has(node.object.name)) return;
        if (node.property.type === 'Identifier' && !node.computed && GLOBALS.has(node.property.name)) {
          report(node, `${node.object.name}.${node.property.name}`);
        }
      },
      ImportDeclaration(node) {
        const source = String(node.source.value);
        if (LIBRARIES.test(source)) context.report({ node, messageId: 'library', data: { source } });
      },
      // Configured globals resolve to a definition-less variable instead of staying in `through`.
      'Program:exit'(program) {
        const scope = context.sourceCode.getScope(program);
        const refs = [...scope.through];
        for (const name of GLOBALS) {
          const variable = scope.set.get(name);
          if (variable && variable.defs.length === 0) refs.push(...variable.references);
        }
        for (const ref of refs) {
          if (GLOBALS.has(ref.identifier.name)) report(ref.identifier, ref.identifier.name);
        }
      },
    };
  },
};
