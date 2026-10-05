import rule from '../eslint-rules/mcp-api-only.mjs';
import { ruleTester } from './rule-tester.ts';

ruleTester.run('mcp-api-only', rule, {
  valid: [
    "import { z } from 'zod';",
    "import { McpServer } from '@modelcontextprotocol/server';",
    "import type { Project } from '@nothingleft/types';",
    "import { t } from '@nothingleft/i18n';",
    "import { apiClient } from './api.ts';",
    "import { TOOLS } from '../tools/index.ts';",
  ],
  invalid: [
    { code: "import { projectsRepository } from '@nothingleft/db';", errors: [{ messageId: 'forbidden' }] },
    { code: "import type { Db } from '@nothingleft/db';", errors: [{ messageId: 'forbidden' }] },
    { code: "import { createAnalytics } from '@nothingleft/analytics';", errors: [{ messageId: 'forbidden' }] },
    { code: "import { projectsService } from '@services/projects.service';", errors: [{ messageId: 'forbidden' }] },
    { code: "import { AppError } from '@lib/errors';", errors: [{ messageId: 'forbidden' }] },
    {
      code: "import { can } from '../../../apps/api/src/services/permissions.ts';",
      errors: [{ messageId: 'forbidden' }],
    },
    { code: "export * from '@nothingleft/db';", errors: [{ messageId: 'forbidden' }] },
    { code: "const db = await import('@nothingleft/db');", errors: [{ messageId: 'forbidden' }] },
    { code: "import { eq } from 'drizzle-orm';", errors: [{ messageId: 'forbidden' }] },
    { code: "import { Pool } from 'pg';", errors: [{ messageId: 'forbidden' }] },
  ],
});
