import composeFile from '../../../../../docker-compose.yml?raw';
import type { FaqEntry } from '@lib/faq';
import { GITHUB_URL, LICENSE_URL } from '@lib/site';

export const COMPOSE_URL = `${GITHUB_URL}/blob/main/docker-compose.yml`;
export const INFRASTRUCTURE_DOC_URL = `${GITHUB_URL}/blob/main/docs/infrastructure.md`;
export const STORAGE_MANUAL_PATH = '/docs/manual/storage';

// Shown from `services:` on, exactly as committed; the header comment is local-development advice.
export const COMPOSE_SERVICES = composeFile.slice(composeFile.indexOf('services:')).trimEnd();

export interface ServiceNode {
  id: string;
  name: string;
  tech: string;
  routes?: string[];
  body: string[];
  source: string;
}

export interface ArchitectureTier {
  id: string;
  label: string;
  nodes: ServiceNode[];
}

export const CLIENTS = [
  { name: 'People', detail: 'in a browser, signed in with a session cookie' },
  { name: 'Agents', detail: 'in an MCP client, with a personal access token' },
];

export const TIERS: ArchitectureTier[] = [
  {
    id: 'app',
    label: 'You run',
    nodes: [
      {
        id: 'web',
        name: 'Web app',
        tech: 'Next.js build',
        body: [
          'The interface people use. The browser calls the API directly, so the build needs one setting: NEXT_PUBLIC_API_BASE_URL, matching the API’s API_BASE_URL, inlined at build time.',
        ],
        source: 'apps/web/.env.example',
      },
      {
        id: 'api',
        name: 'API',
        tech: 'Fastify on Bun, one process',
        routes: ['/v1  REST', '/mcp  MCP', '/health'],
        body: [
          'The only backend process. It must be long-running, not serverless: the job queue holds a Postgres connection and runs scheduled work in-process.',
          'MCP is part of the same process. Its tools call the REST API over loopback, so an agent passes the same permissions and rules as a person. Configuration is validated at boot, and the process refuses to start on a bad one.',
        ],
        source: 'docs/architecture.md § apps/api · docs/infrastructure.md § Hosting requirements',
      },
    ],
  },
  {
    id: 'data',
    label: 'You provide',
    nodes: [
      {
        id: 'postgres',
        name: 'PostgreSQL',
        tech: 'Standard wire protocol',
        body: [
          'Every record, and the background job queue. Two connection strings: DATABASE_URL (direct) for migrations and jobs, DATABASE_URL_POOLED for application queries.',
          'Two roles: the owner migrates, and nothingleft_app runs every query. The audit log is append-only for that role, so it must not own tables or be a superuser.',
        ],
        source: 'docs/infrastructure.md § Environment configuration, § Database roles',
      },
      {
        id: 'redis',
        name: 'Redis',
        tech: 'Any Redis 6 or later',
        body: [
          'Session cache, rate-limit counters, report caches and idempotency replays. It is not the job queue. Outside localhost, REDIS_URL must use TLS (rediss://).',
        ],
        source: 'docs/backend-guide.md · docs/tech-stack.md · apps/api/.env.example',
      },
      {
        id: 'storage',
        name: 'Object storage',
        tech: 'Any S3-compatible store, two buckets',
        routes: ['private  attachments, exports, imports', 'public  avatars only'],
        body: [
          'The private bucket has no public access: the API checks each request and redirects to a short-lived presigned URL. The public bucket holds avatars and nothing else.',
          'File bytes never pass through the API. Browsers upload and download directly with presigned URLs; the API only authorises.',
        ],
        source: 'docs/file-storage.md § Principles, § Two buckets',
      },
    ],
  },
];

export interface EnvLine {
  name?: string;
  value?: string;
  comment?: string;
}

export const API_ENV: EnvLine[] = [
  { name: 'NODE_ENV', value: 'production' },
  { name: 'PORT', value: '4000' },
  {},
  { comment: 'Direct for migrations and jobs; pooled for queries' },
  { name: 'DATABASE_URL', value: 'postgres://OWNER:PASSWORD@DB_HOST:5432/nothingleft' },
  { name: 'DATABASE_URL_POOLED', value: 'postgres://nothingleft_app:PASSWORD@DB_HOST:5432/nothingleft' },
  { name: 'REDIS_URL', value: 'rediss://default:PASSWORD@REDIS_HOST:6379' },
  {},
  { comment: 'Web and API on one registrable domain' },
  { name: 'APP_BASE_URL', value: 'https://work.example.com' },
  { name: 'API_BASE_URL', value: 'https://api.example.com' },
  { name: 'SESSION_COOKIE_DOMAIN', value: '.example.com' },
  { name: 'TRUST_PROXY', value: '1' },
  {},
  { comment: 'Two buckets on any S3-compatible store' },
  { name: 'S3_ENDPOINT', value: 'https://s3.example.com' },
  { name: 'S3_REGION', value: 'auto' },
  { name: 'S3_ACCESS_KEY_ID', value: 'ACCESS_KEY_ID' },
  { name: 'S3_SECRET_ACCESS_KEY', value: 'SECRET_ACCESS_KEY' },
  { name: 'S3_PRIVATE_BUCKET', value: 'nl-private' },
  { name: 'S3_PUBLIC_BUCKET', value: 'nl-public' },
  { name: 'S3_PUBLIC_BUCKET_BASE_URL', value: 'https://static.example.com' },
  {},
  { comment: 'Required in production' },
  { name: 'ENCRYPTION_MASTER_KEY', value: 'BASE64_OF_32_BYTES' },
  { name: 'EMAIL_LINK_SECRET', value: 'AT_LEAST_32_CHARACTERS' },
  { name: 'RESEND_API_KEY', value: 're_xxxxxxxx' },
  { name: 'EMAIL_FROM', value: '"Nothing Left <noreply@example.com>"' },
  {},
  { comment: 'Free-plan limits (defaults shown)' },
  { name: 'FREE_SEAT_LIMIT', value: '20' },
  { name: 'FREE_STORAGE_BYTES', value: '5368709120' },
  {},
  { comment: 'Product analytics and error capture, each off' },
  { name: 'POSTHOG_ANALYTICS_ENABLED', value: 'false' },
  { name: 'POSTHOG_ERRORS_ENABLED', value: 'false' },
];

export const WEB_ENV: EnvLine[] = [
  { comment: 'Inlined at build time; match API_BASE_URL' },
  { name: 'NEXT_PUBLIC_API_BASE_URL', value: 'https://api.example.com' },
];

export interface ConfigTab {
  id: string;
  name: string;
  where: string;
  html: string;
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function envFile(lines: EnvLine[]): string {
  return lines
    .map(line =>
      line.comment
        ? `<span class="c"># ${escapeHtml(line.comment)}</span>`
        : line.name
          ? `<span class="k">${line.name}</span>=${escapeHtml(line.value ?? '')}`
          : '',
    )
    .join('\n');
}

export const CONFIG_TABS: ConfigTab[] = [
  {
    id: 'compose',
    name: 'docker-compose.yml',
    where: 'The data tier only, as committed.',
    html: escapeHtml(COMPOSE_SERVICES),
  },
  {
    id: 'api-env',
    name: 'apps/api/.env',
    where: 'An excerpt, placeholder values.',
    html: envFile(API_ENV),
  },
  {
    id: 'web-env',
    name: 'apps/web/.env',
    where: 'One setting.',
    html: envFile(WEB_ENV),
  },
];

export const LIMITS = [
  {
    name: 'FREE_SEAT_LIMIT',
    fallback: '20 members',
    effect:
      'Where the seat notice starts. Members beyond it are still allowed: the invite dialog and a banner for admins say so, and nothing is blocked.',
  },
  {
    name: 'FREE_STORAGE_BYTES',
    fallback: '5368709120 bytes, 5 GB',
    effect:
      'The storage cap for attachments. Warnings at 80% and 95%; at 100% new uploads are refused until there is room. Avatars never count.',
  },
];

export const HEALTH_EXCERPT = `$ curl https://api.example.com/health
{ "data": { "status": "ok" }, "meta": { "request_id": "…" } }

$ curl https://api.example.com/health/deep
{
  "data": {
    "status": "ok",
    "checks": { "db": "ok", "redis": "ok", "storage": "ok" }
  },
  "meta": { "request_id": "…" }
}`;

export interface Responsibility {
  area: string;
  hosted: string;
  self: string;
}

export const RESPONSIBILITIES: Responsibility[] = [
  {
    area: 'Running the services',
    hosted: 'We run the web app, the API with /mcp, the database, Redis and the buckets.',
    self: 'You run the web app and the API, and provide PostgreSQL, Redis and an S3-compatible store.',
  },
  {
    area: 'Upgrades',
    hosted: 'We deploy them. Migrations run before a new API version takes traffic.',
    self: 'You pull the new source, migrate and restart. The steps ship with the install guide.',
  },
  {
    area: 'Backups',
    hosted: 'Ours, for the hosted database and platform storage. A bucket you connect is yours.',
    self: 'Yours: PostgreSQL and both buckets. Guidance ships with the install guide.',
  },
  {
    area: 'Email',
    hosted: 'Account, security, invitation and storage email is sent for you.',
    self: 'You supply a mail provider key (RESEND_API_KEY) and EMAIL_FROM. Without a key, mail is logged, not sent.',
  },
  {
    area: 'File storage',
    hosted: '5 GB per organisation on the free plan, or connect your own R2 or S3 bucket.',
    self: 'Your own store and two buckets. FREE_STORAGE_BYTES sets the cap.',
  },
  {
    area: 'Google and GitHub sign-in',
    hosted: 'Ready to use.',
    self: 'Register your own OAuth apps. Until you do, those buttons answer that the provider is not switched on.',
  },
  {
    area: 'Agent endpoint',
    hosted: 'https://api.nothingleft.dev/mcp',
    self: '/mcp on your own API address.',
  },
];

export const SELF_HOSTING_FAQ: FaqEntry[] = [
  {
    question: 'What does the AGPL-3.0 licence ask of us?',
    answer: [
      'You may run, study, change and share the code. If you modify it and let people use your version over a network, the licence asks you to offer those users its source. The licence text is the authority, not this summary.',
    ],
    link: { href: LICENSE_URL, label: 'Read the licence', external: true },
  },
  {
    question: 'Where does our data live?',
    answer: [
      'Self-hosted: in your PostgreSQL database and your two buckets, wherever you run them. Product analytics and error capture are separate switches, and with both off nothing is sent.',
      'On the hosted service, issues, comments and accounts are in our database. Attachments can live in your own R2 bucket (with an EU or FedRAMP jurisdiction) or S3 bucket in your region; avatars stay with us.',
    ],
  },
  {
    question: 'Is the self-hosted build different from the hosted one?',
    answer: [
      'No. It is the same codebase and the same build. Plans are limit presets, not feature gates, so there is no reduced community edition and nothing to unlock.',
    ],
  },
  {
    question: 'Is docker-compose.yml a production install?',
    answer: [
      'No. It runs the data tier, PostgreSQL 16, Redis 7 and an S3-compatible store, with development credentials. It does not run the web app or the API. The install guide, with production steps, ships with launch.',
    ],
    link: { href: COMPOSE_URL, label: 'Read the compose file', external: true },
  },
  {
    question: 'Can our agents connect to a self-hosted install?',
    answer: [
      'Yes. MCP is served by the API at /mcp, so an HTTP client points at your own address with a personal access token. The local stdio shim reads the address from NOTHINGLEFT_MCP_URL.',
    ],
    link: { href: '/docs/manual/mcp', label: 'MCP setup guide' },
  },
  {
    question: 'Is connecting our own bucket the same as self-hosting?',
    answer: [
      'No. Your own R2 or S3 bucket is a storage option on the hosted service: attachments move into your account and the storage limit lifts, while the app and its database stay with us. Self-hosting means running all of it yourself.',
    ],
    link: { href: STORAGE_MANUAL_PATH, label: 'Storage manual' },
  },
];
