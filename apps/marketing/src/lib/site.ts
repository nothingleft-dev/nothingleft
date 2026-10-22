export const SITE_URL = 'https://nothingleft.dev';
export const SITE_NAME = 'Nothing Left';
export const SIGN_UP_URL = 'https://work.nothingleft.dev/sign-up';
export const SIGN_IN_URL = 'https://work.nothingleft.dev/sign-in';
export const GITHUB_URL = 'https://github.com/nothingleft-dev/nothingleft';
export const SUPPORT_EMAIL = 'admin@nothingleft.dev';
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const SITE_DESCRIPTION =
  'Open-source project tracking for product and engineering teams: issues, sprints and project knowledge your team and AI agents can both use.';

// Shared by the agent index and the Markdown product overview.
export const PRODUCT_CONTEXT = [
  'Nothing Left is in beta. The hosted service has no subscription charge for teams of any size during beta. The first 20 members of every organisation stay free forever; pricing for additional seats has not been announced, and any future charge will come with advance notice. Each organisation includes 5 GB of platform file storage, with an option to connect its own R2 or S3 bucket.',
  'The code is licensed under AGPL-3.0. Hosted and self-hosted installations use the same build, with no reduced community edition. The repository’s Docker Compose file runs the complete application on one machine, and install guides cover Docker Compose and AWS. There is no setting that turns sign-up off on a self-hosted install.',
  'AI agents connect through the Model Context Protocol (MCP), using personal access tokens constrained by token scopes and the user’s permissions. An agent is optional: the web app also supports the core workflows directly.',
].join('\n\n');
