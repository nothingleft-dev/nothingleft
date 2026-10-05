import rule from '../eslint-rules/no-date-formatting.mjs';
import { ruleTester } from './rule-tester.ts';

ruleTester.run('no-date-formatting', rule, {
  valid: [
    'const label = formatDate(issue.created_at);',
    'const wire = new Date().toISOString();',
    'const n = new Intl.NumberFormat("en").format(count);',
    "import { addDays, differenceInCalendarDays } from 'date-fns';",
    "import { addDays } from 'date-fns/addDays';",
    "import { formatDate } from '@lib/datetime';",
  ],
  invalid: [
    { code: 'new Date().toLocaleDateString();', errors: [{ messageId: 'formatter' }] },
    { code: 'd.toLocaleTimeString("en-GB");', errors: [{ messageId: 'formatter' }] },
    { code: 'd.toLocaleString();', errors: [{ messageId: 'formatter' }] },
    { code: 'd.toDateString();', errors: [{ messageId: 'formatter' }] },
    { code: 'd.toUTCString();', errors: [{ messageId: 'formatter' }] },
    { code: 'new Intl.DateTimeFormat("en-GB").format(d);', errors: [{ messageId: 'formatter' }] },
    { code: 'new Intl.RelativeTimeFormat("en").format(-1, "day");', errors: [{ messageId: 'formatter' }] },
    { code: "import { format } from 'date-fns';", errors: [{ messageId: 'formatter' }] },
    {
      code: "import { addDays, formatDistanceToNow } from 'date-fns';",
      errors: [{ messageId: 'formatter', data: { name: 'date-fns#formatDistanceToNow' } }],
    },
    { code: "import { format } from 'date-fns/format';", errors: [{ messageId: 'formatter' }] },
    { code: "import { formatInTimeZone } from 'date-fns-tz';", errors: [{ messageId: 'formatter' }] },
    { code: "import dayjs from 'dayjs';", errors: [{ messageId: 'library' }] },
    { code: "import moment from 'moment';", errors: [{ messageId: 'library' }] },
  ],
});
