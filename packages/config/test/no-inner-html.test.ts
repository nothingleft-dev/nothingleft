import rule from '../eslint-rules/no-inner-html.mjs';
import { ruleTester } from './rule-tester.ts';

ruleTester.run('no-inner-html', rule, {
  valid: [
    'const el = <Markdown source={body} />;',
    'el.textContent = text;',
    'const html = el.innerHTML;',
    'el.insertAdjacentText("beforeend", text);',
  ],
  invalid: [
    { code: 'const el = <div dangerouslySetInnerHTML={{ __html: body }} />;', errors: [{ messageId: 'html' }] },
    { code: 'const props = { dangerouslySetInnerHTML: { __html: body } };', errors: [{ messageId: 'html' }] },
    { code: 'el.innerHTML = body;', errors: [{ messageId: 'html' }] },
    { code: 'el.outerHTML += body;', errors: [{ messageId: 'html' }] },
    { code: 'el.insertAdjacentHTML("beforeend", body);', errors: [{ messageId: 'html' }] },
  ],
});
