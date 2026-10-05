// `file` stays legal: the OS file picker has no shadcn equivalent, and it is always hidden
// behind a button.
const NATIVE_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
  'color',
  'range',
]);
const NATIVE_DIALOGS = new Set(['alert', 'confirm', 'prompt']);
const BROWSER_VALIDATION = new Set(['required', 'minLength', 'maxLength', 'pattern', 'min', 'max']);
const GLOBALS = new Set(['window', 'globalThis', 'self']);

const attribute = (node, name) =>
  node.attributes.find(a => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name);
const literalValue = attr =>
  attr?.value?.type === 'Literal'
    ? attr.value.value
    : attr?.value?.type === 'JSXExpressionContainer' && attr.value.expression.type === 'Literal'
      ? attr.value.expression.value
      : undefined;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'No browser-native form controls, dialogs or validation bubbles (CLAUDE.md rule 10).' },
    schema: [],
    messages: {
      element:
        '`<{{name}}>` is a browser-native control. Use the shadcn/Radix component (choice-select, Checkbox, RadioGroup, DatePicker).',
      input: '`<input type="{{type}}">` is a browser-native control. Use the shadcn/Radix component instead.',
      dialog: '`{{name}}()` is a browser-native dialog. Use ConfirmDialog or a toast.',
      validation:
        '`{{name}}` shows the browser’s own validation bubble. Validate with the Zod schema and `noValidate`.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        const name = node.name.name;
        if (name === 'select') context.report({ node, messageId: 'element', data: { name } });
        if (name !== 'input' && name !== 'textarea' && name !== 'select') return;
        const type = literalValue(attribute(node, 'type'));
        if (name === 'input' && typeof type === 'string' && NATIVE_INPUT_TYPES.has(type)) {
          context.report({ node, messageId: 'input', data: { type } });
        }
        for (const prop of BROWSER_VALIDATION) {
          const attr = attribute(node, prop);
          if (attr) context.report({ node: attr, messageId: 'validation', data: { name: prop } });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' &&
                !callee.computed &&
                callee.object.type === 'Identifier' &&
                GLOBALS.has(callee.object.name) &&
                callee.property.type === 'Identifier'
              ? callee.property.name
              : null;
        if (name && NATIVE_DIALOGS.has(name)) context.report({ node, messageId: 'dialog', data: { name } });
      },
    };
  },
};
