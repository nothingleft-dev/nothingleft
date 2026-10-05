import rule from '../eslint-rules/no-native-controls.mjs';
import { ruleTester } from './rule-tester.ts';

ruleTester.run('no-native-controls', rule, {
  valid: [
    'const el = <input type="text" value={v} />;',
    'const el = <input type="file" hidden />;',
    'const el = <input value={v} />;',
    'const el = <Checkbox checked={on} />;',
    'const el = <textarea rows={4} />;',
    'toast.error(message);',
    'dialog.confirm();',
  ],
  invalid: [
    { code: 'const el = <select value={v} />;', errors: [{ messageId: 'element' }] },
    { code: 'const el = <input type="checkbox" />;', errors: [{ messageId: 'input' }] },
    { code: 'const el = <input type={"date"} />;', errors: [{ messageId: 'input' }] },
    { code: 'const el = <input type="radio" name="r" />;', errors: [{ messageId: 'input' }] },
    { code: 'const el = <input required />;', errors: [{ messageId: 'validation' }] },
    { code: 'const el = <textarea minLength={3} />;', errors: [{ messageId: 'validation' }] },
    { code: 'alert("Saved");', errors: [{ messageId: 'dialog' }] },
    { code: 'if (window.confirm("Sure?")) go();', errors: [{ messageId: 'dialog' }] },
    { code: 'const name = globalThis.prompt("Name");', errors: [{ messageId: 'dialog' }] },
  ],
});
