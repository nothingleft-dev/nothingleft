import mcpApiOnly from './eslint-rules/mcp-api-only.mjs';
import noDateFormatting from './eslint-rules/no-date-formatting.mjs';
import noHttpClient from './eslint-rules/no-http-client.mjs';
import noInnerHtml from './eslint-rules/no-inner-html.mjs';
import noNativeControls from './eslint-rules/no-native-controls.mjs';
import noRawDb from './eslint-rules/no-raw-db.mjs';
import noUserFacingLiterals from './eslint-rules/no-user-facing-literals.mjs';

export default {
  meta: { name: '@nothingleft/eslint-plugin' },
  rules: {
    'mcp-api-only': mcpApiOnly,
    'no-date-formatting': noDateFormatting,
    'no-http-client': noHttpClient,
    'no-inner-html': noInnerHtml,
    'no-native-controls': noNativeControls,
    'no-raw-db': noRawDb,
    'no-user-facing-literals': noUserFacingLiterals,
  },
};
