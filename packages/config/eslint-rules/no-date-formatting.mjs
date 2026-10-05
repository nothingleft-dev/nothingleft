const INTL_FORMATTERS = new Set(['DateTimeFormat', 'RelativeTimeFormat', 'DurationFormat']);
const DATE_TO_TEXT = new Set([
  'toLocaleDateString',
  'toLocaleTimeString',
  'toLocaleString',
  'toDateString',
  'toTimeString',
  'toUTCString',
  'toGMTString',
]);
const DATE_FNS_FORMATTERS = new Set([
  'format',
  'formatDistance',
  'formatDistanceStrict',
  'formatDistanceToNow',
  'formatDistanceToNowStrict',
  'formatRelative',
  'formatDuration',
  'formatISODuration',
  'intlFormat',
  'intlFormatDistance',
  'lightFormat',
  'formatInTimeZone',
]);
const FORMATTING_LIBRARIES = /^(moment|moment-timezone|dayjs)(\/|$)/;
const DATE_FNS = /^date-fns(-tz)?(\/(.+))?$/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Dates become text only in apps/web/lib/datetime.' },
    schema: [],
    messages: {
      formatter: '`{{name}}` formats a date. Use a function from lib/datetime.',
      library: '`{{source}}` formats dates; lib/datetime is the one formatter.',
    },
  },
  create(context) {
    const report = (node, name) => context.report({ node, messageId: 'formatter', data: { name } });
    return {
      MemberExpression(node) {
        if (node.computed || node.property.type !== 'Identifier') return;
        const name = node.property.name;
        if (node.object.type === 'Identifier' && node.object.name === 'Intl' && INTL_FORMATTERS.has(name)) {
          report(node, `Intl.${name}`);
        } else if (DATE_TO_TEXT.has(name)) {
          report(node.property, name);
        }
      },
      ImportDeclaration(node) {
        const source = String(node.source.value);
        if (FORMATTING_LIBRARIES.test(source)) {
          context.report({ node, messageId: 'library', data: { source } });
          return;
        }
        const dateFns = DATE_FNS.exec(source);
        if (!dateFns) return;
        const subpath = dateFns[3];
        if (subpath && DATE_FNS_FORMATTERS.has(subpath)) {
          report(node, source);
          return;
        }
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
            if (DATE_FNS_FORMATTERS.has(spec.imported.name)) report(spec, `${source}#${spec.imported.name}`);
          }
        }
      },
    };
  },
};
