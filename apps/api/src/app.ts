import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import redisPlugin from '@fastify/redis';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { createAnalytics, noopAnalytics, type Analytics } from '@nothingleft/analytics';
import {
  attachmentsRepository,
  boardsRepository,
  customFieldsRepository,
  workItemAttributesRepository,
  articlesRepository,
  articleSearchRepository,
  reportsRepository,
  commentsRepository,
  createDb,
  exportJobsRepository,
  gitConnectionsRepository,
  gitEntitiesRepository,
  gitEventsRepository,
  gitIdentitiesRepository,
  gitLinksRepository,
  gitRepositoriesRepository,
  importJobsRepository,
  orgExportRepository,
  invitationsRepository,
  issueActivityRepository,
  issueLinksRepository,
  issueSearchRepository,
  issuesRepository,
  notificationsRepository,
  oneTimeTokensRepository,
  organizationPurgeRepository,
  orgStorageConfigsRepository,
  orgStorageLocationsRepository,
  totpRecoveryCodesRepository,
  orgActivityRepository,
  organizationsRepository,
  personalAccessTokensRepository,
  projectSchemaRepository,
  projectsRepository,
  recentSearchesRepository,
  savedViewsRepository,
  sessionsRepository,
  sprintsRepository,
  tagsRepository,
  userPreferencesRepository,
  usersRepository,
  workItemsRepository,
} from '@nothingleft/db';
import {
  emailLinkSecret,
  encryptionMasterKey,
  fastifyTrustProxy,
  filesBaseUrl,
  githubApp,
  parseTrustProxy,
  type Env,
} from '@config/env';
import { subkey } from '@lib/crypto';
import {
  CORS_EXPOSED_HEADERS,
  RATE_LIMIT_MAX_ANONYMOUS,
  RATE_LIMIT_MAX_PER_PAT,
  RATE_LIMIT_MAX_PER_SESSION,
  RATE_LIMIT_WINDOW_MS,
  REDIS_COMMAND_TIMEOUT_MS,
  REQUEST_BODY_LIMIT_BYTES,
} from '@config/constants';
import { createLogger } from '@lib/logger';
import { bestEffort, createMailer, type Mailer } from '@lib/email';
import { avatarMarks, resolveAvatarUrl } from '@lib/avatar';
import { createOAuthClients, type OAuthClients } from '@lib/oauth';
import { isPasswordBreached } from '@lib/password';
import { resolveHost as dnsResolveHost, type ResolveHost } from '@lib/network';
import { guardedFetch, type GitFetch } from '@git/http';
import { createProviders } from '@git/providers/index';
import { createStorage, type Storage } from '@lib/storage';
import { recordingQueue, startJobs, type JobHandlers, type JobQueue, type QueuedHandlers } from '@lib/jobs';
import { requestIdOptions } from '@plugins/request-id';
import envelope from '@plugins/envelope';
import errorHandler from '@plugins/error-handler';
import analyticsPlugin from '@plugins/analytics';
import idempotency, { recordProjectTouched, redisIdempotencyStore } from '@plugins/idempotency';
import reportVersion, { recordOrgTouched } from '@plugins/report-version';
import notify from '@plugins/notify';
import auth from '@middleware/auth';
import originCheck from '@middleware/origin';
import avatarsRoutes from '@routes/avatars';
import healthRoutes from '@routes/health';
import authRoutes from '@routes/auth';
import meRoutes from '@routes/me';
import organizationsRoutes from '@routes/organizations';
import membersRoutes from '@routes/members';
import activityRoutes from '@routes/activity';
import projectsRoutes from '@routes/projects';
import invitationsRoutes from '@routes/invitations';
import issuesRoutes from '@routes/issues';
import commentsRoutes from '@routes/comments';
import workItemsRoutes from '@routes/work-items';
import attachmentsRoutes from '@routes/attachments';
import filesRoutes from '@routes/files';
import issueLinksRoutes from '@routes/issue-links';
import tagsRoutes from '@routes/tags';
import savedViewsRoutes from '@routes/saved-views';
import mcpRoutes from '@routes/mcp';
import type { Fetch } from '@nothingleft/mcp-server';
import searchRoutes from '@routes/search';
import reportsRoutes from '@routes/reports';
import projectSchemaRoutes from '@routes/project-schema';
import customFieldsRoutes from '@routes/custom-fields';
import workItemAttributesRoutes from '@routes/work-item-attributes';
import sprintsRoutes from '@routes/sprints';
import articlesRoutes from '@routes/articles';
import boardsRoutes from '@routes/boards';
import notificationsRoutes from '@routes/notifications';
import ownershipTransfersRoutes from '@routes/ownership-transfers';
import storageRoutes from '@routes/storage';
import importsRoutes from '@routes/imports';
import exportsRoutes from '@routes/exports';
import gitRoutes from '@routes/git';
import gitWebhookRoutes from '@routes/git-webhooks';
import { accessService } from '@services/access';
import { activityService } from '@services/activity.service';
import { invitationsService } from '@services/invitations.service';
import { homeService } from '@services/home.service';
import { issuesService } from '@services/issues.service';
import { commentsService } from '@services/comments.service';
import { workItemsService } from '@services/work-items.service';
import { attachmentsService } from '@services/attachments.service';
import { issueLinksService } from '@services/issue-links.service';
import { tagsService } from '@services/tags.service';
import { savedViewsService } from '@services/saved-views.service';
import { searchService } from '@services/search.service';
import { reportsService } from '@services/reports.service';
import { reportCache } from '@services/report-cache';
import { projectSchemaService } from '@services/project-schema.service';
import { customFieldsService } from '@services/custom-fields.service';
import { workItemAttributesService } from '@services/work-item-attributes.service';
import { membersService } from '@services/members.service';
import { organizationsService } from '@services/organizations.service';
import { projectsService } from '@services/projects.service';
import { sprintsService } from '@services/sprints.service';
import { boardsService } from '@services/boards.service';
import { articlesService } from '@services/articles.service';
import { articleCommentsService } from '@services/article-comments.service';
import { notificationsService } from '@services/notifications.service';
import { notificationFanout } from '@services/notification-fanout';
import type { TenantRepos } from '@services/transaction';
import type { Queryable } from '@nothingleft/db';
import { accountLifecycleService } from '@services/account-lifecycle.service';
import { accountsService, type AccountsDeps } from '@services/accounts.service';
import { avatarMirror, type AvatarMirrorDeps } from '@services/avatar-mirror';
import { organizationLifecycleService } from '@services/organization-lifecycle.service';
import { objectStores } from '@services/object-stores';
import { storageService } from '@services/storage.service';
import { importsService } from '@services/imports.service';
import { exportsService } from '@services/exports.service';
import { gitConnectionsService } from '@services/git-connections.service';
import { gitIngestService } from '@services/git-ingest.service';
import { gitRepositoriesService } from '@services/git-repositories.service';
import { developmentReader } from '@services/git-development';
import { gitDevelopmentService } from '@services/git-development.service';
import { gitLinksService } from '@services/git-links.service';
import { twoFactorService } from '@services/two-factor.service';
import { authService } from '@services/auth.service';
import { meService } from '@services/me.service';
import { oauthService } from '@services/oauth.service';
import { sessionsService } from '@services/sessions.service';
import { tenancyService } from '@services/tenancy.service';
import { tokensService } from '@services/tokens.service';

export interface BuildOptions {
  analytics?: Analytics;
  mailer?: Mailer;
  /** Off in tests: pg-boss needs the direct connection and its own schema. */
  jobs?: boolean;
  isPasswordBreached?: AccountsDeps['isPasswordBreached'];
  resolveAvatarUrl?: AccountsDeps['resolveAvatarUrl'];
  oauthClients?: OAuthClients;
  /** Tests give each app its own buckets: every injected request shares 127.0.0.1. */
  rateLimitNamespace?: string;
  /** How /mcp's tools reach the REST API; tests route it through app.inject instead of a socket. */
  mcpFetch?: Fetch;
  /** Tests stand in an in-memory bucket. */
  storage?: Storage;
  /** How avatar.mirror fetches a provider photo; tests never reach Google or GitHub. */
  avatarFetch?: AvatarMirrorDeps['fetch'];
  /** The clock two-factor codes are checked against; tests step it to play an authenticator. */
  now?: () => Date;
  /** How the git integration reaches GitHub and GitLab; tests answer from recorded responses. */
  gitFetch?: GitFetch;
  /** How a self-managed base URL's host is resolved for the private-network check. */
  gitResolveHost?: ResolveHost;
}

export async function buildApp(env: Env, opts: BuildOptions = {}) {
  const trust = parseTrustProxy(env.TRUST_PROXY, env.NODE_ENV);
  const app = Fastify({
    loggerInstance: createLogger(env),
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    trustProxy: fastifyTrustProxy(trust),
    ...requestIdOptions,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const { db, pool } = createDb(env.DATABASE_URL_POOLED);
  app.addHook('onClose', async () => {
    await pool.end();
  });

  const analytics =
    opts.analytics ??
    (env.NODE_ENV === 'test'
      ? noopAnalytics
      : createAnalytics({
          key: env.POSTHOG_KEY,
          host: env.POSTHOG_HOST,
          analyticsEnabled: env.POSTHOG_ANALYTICS_ENABLED,
          errorsEnabled: env.POSTHOG_ERRORS_ENABLED,
          sampleRate: env.POSTHOG_SAMPLE_RATE,
        }));

  const mailer = opts.mailer ?? createMailer(env, app.log);
  const storage = opts.storage ?? createStorage(env);
  const marks = avatarMarks(env.API_BASE_URL);

  const repos = {
    users: usersRepository(db),
    organizations: organizationsRepository(db),
    sessions: sessionsRepository(db),
    patTokens: personalAccessTokensRepository(db),
    oneTimeTokens: oneTimeTokensRepository(db),
    preferences: userPreferencesRepository(db),
    projects: projectsRepository(db),
    invitations: invitationsRepository(db),
    activity: orgActivityRepository(db),
    schema: projectSchemaRepository(db),
    issues: issuesRepository(db),
    issueActivity: issueActivityRepository(db),
    issueSearch: issueSearchRepository(db),
    savedViews: savedViewsRepository(db),
    recentSearches: recentSearchesRepository(db),
    comments: commentsRepository(db),
    issueLinks: issueLinksRepository(db),
    tags: tagsRepository(db),
    workItems: workItemsRepository(db),
    attachments: attachmentsRepository(db),
    sprints: sprintsRepository(db),
    boards: boardsRepository(db),
    customFields: customFieldsRepository(db),
    workItemAttributes: workItemAttributesRepository(db),
    articles: articlesRepository(db),
    articleSearch: articleSearchRepository(db),
    reports: reportsRepository(db),
    notifications: notificationsRepository(db),
    recoveryCodes: totpRecoveryCodesRepository(db),
    storageConfigs: orgStorageConfigsRepository(db),
    storageLocations: orgStorageLocationsRepository(db),
    importJobs: importJobsRepository(db),
    exportJobs: exportJobsRepository(db),
    orgExport: orgExportRepository(db),
    gitConnections: gitConnectionsRepository(db),
    gitRepositories: gitRepositoriesRepository(db),
    gitEvents: gitEventsRepository(db),
    gitEntities: gitEntitiesRepository(db),
    gitLinks: gitLinksRepository(db),
    gitIdentities: gitIdentitiesRepository(db),
  };

  const tenantRepos = (q: Queryable): TenantRepos => ({
    organizations: organizationsRepository(q),
    projects: projectsRepository(q),
    invitations: invitationsRepository(q),
    activity: orgActivityRepository(q),
    users: usersRepository(q),
    schema: projectSchemaRepository(q),
    issues: issuesRepository(q),
    issueActivity: issueActivityRepository(q),
    comments: commentsRepository(q),
    issueLinks: issueLinksRepository(q),
    tags: tagsRepository(q),
    workItems: workItemsRepository(q),
    attachments: attachmentsRepository(q),
    storageConfigs: orgStorageConfigsRepository(q),
    savedViews: savedViewsRepository(q),
    sprints: sprintsRepository(q),
    boards: boardsRepository(q),
    customFields: customFieldsRepository(q),
    workItemAttributes: workItemAttributesRepository(q),
    articles: articlesRepository(q),
    oneTimeTokens: oneTimeTokensRepository(q),
    organizationPurge: organizationPurgeRepository(q),
    importJobs: importJobsRepository(q),
    exportJobs: exportJobsRepository(q),
    gitConnections: gitConnectionsRepository(q),
    gitRepositories: gitRepositoriesRepository(q),
    gitEvents: gitEventsRepository(q),
    gitEntities: gitEntitiesRepository(q),
    gitLinks: gitLinksRepository(q),
  });
  const inTenantTransaction = <T>(body: (r: TenantRepos) => Promise<T>) => db.transaction(tx => body(tenantRepos(tx)));

  await app.register(cookie);
  await app.register(cors, {
    origin: env.APP_BASE_URL,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    exposedHeaders: [...CORS_EXPOSED_HEADERS],
  });
  await app.register(redisPlugin, {
    url: env.REDIS_URL,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 1,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
  });
  await app.register(envelope);
  await app.register(analyticsPlugin, { analytics });
  await app.register(errorHandler, { analytics });
  const reportResults = reportCache(app.redis);
  await app.register(reportVersion, { bump: orgId => reportResults.bump(orgId) });
  // Replaced by pg-boss once jobs start; tests keep the recording queue and run its jobs themselves.
  let queue: JobQueue = recordingQueue();
  app.decorate('jobQueue', {
    getter: () => queue,
  });
  await app.register(notify, { queue: () => queue, report: error => analytics.captureException(error) });

  const authSvc = authService({
    users: repos.users,
    sessions: repos.sessions,
    tokens: repos.patTokens,
    redis: app.redis,
    analytics,
  });
  const tenancy = tenancyService({
    organizations: repos.organizations,
    projects: repos.projects,
    sessions: repos.sessions,
  });
  const twoFactor = twoFactorService({
    users: repos.users,
    recoveryCodes: repos.recoveryCodes,
    sessions: repos.sessions,
    mailer,
    analytics,
    redis: app.redis,
    masterKey: encryptionMasterKey(env),
    appBaseUrl: env.APP_BASE_URL,
    ...(opts.now ? { now: opts.now } : {}),
  });
  const avatars = avatarMirror({
    users: repos.users,
    storage,
    queue: () => queue,
    analytics,
    fetch: opts.avatarFetch ?? ((url, init) => fetch(url, init)),
  });
  const me = meService({
    users: repos.users,
    preferences: repos.preferences,
    organizations: repos.organizations,
    storage,
    marks,
    analytics,
    readableProjectId: async (principal, key) => (await access.project(principal, key)).project.id,
    currentToken: principal => services.tokens.current(principal),
    twoFactor: user => twoFactor.status(user),
  });
  const accounts = accountsService({
    // Rebound to the transaction, so neither a half-created account nor a half-recovered one
    // survives a failure part-way.
    inTransaction: body =>
      db.transaction(tx =>
        body({
          users: usersRepository(tx),
          preferences: userPreferencesRepository(tx),
          sessions: sessionsRepository(tx),
          tokens: personalAccessTokensRepository(tx),
          oneTimeTokens: oneTimeTokensRepository(tx),
          recoveryCodes: totpRecoveryCodesRepository(tx),
        }),
      ),
    isPasswordBreached: opts.isPasswordBreached ?? isPasswordBreached,
    resolveAvatarUrl: opts.resolveAvatarUrl ?? resolveAvatarUrl,
    users: repos.users,
    sessions: repos.sessions,
    oneTimeTokens: repos.oneTimeTokens,
    auth: authSvc,
    twoFactor,
    mailer,
    analytics,
    redis: app.redis,
    appBaseUrl: env.APP_BASE_URL,
    mirrorAvatar: user => avatars.request(user),
    invitationProvesEmail: (token, email) => invitations.provesEmail(token, email),
    defaultOrganization: userId => tenancy.defaultOrganizationFor(userId),
  });
  const sessions = sessionsService({ sessions: repos.sessions, auth: authSvc, tenancy, analytics });
  const access = accessService({
    organizations: repos.organizations,
    projects: repos.projects,
    tenancy,
    storage,
    marks,
    freeSeatLimit: env.FREE_SEAT_LIMIT,
    freeStorageBytes: env.FREE_STORAGE_BYTES,
    touched: recordOrgTouched,
    touchedProject: recordProjectTouched,
  });
  const stores = objectStores({
    storage,
    configs: repos.storageConfigs,
    organizations: repos.organizations,
    masterKey: encryptionMasterKey(env),
    mailer: bestEffort(mailer, error => analytics.captureException(error)),
    analytics,
    appBaseUrl: env.APP_BASE_URL,
  });
  const orgDeps = {
    access,
    sessions,
    inTransaction: inTenantTransaction,
    mailer,
    analytics,
    appBaseUrl: env.APP_BASE_URL,
  };
  const organizations = organizationsService({
    ...orgDeps,
    organizations: repos.organizations,
    users: repos.users,
    storageConfigs: repos.storageConfigs,
  });
  const invitations = invitationsService({
    ...orgDeps,
    invitations: repos.invitations,
    organizations: repos.organizations,
    projects: repos.projects,
    users: repos.users,
    orgs: organizations,
  });
  const search = searchService({
    access,
    users: repos.users,
    projects: repos.projects,
    issues: repos.issues,
    issueSearch: repos.issueSearch,
    savedViews: repos.savedViews,
    recentSearches: repos.recentSearches,
    customFields: repos.customFields,
    analytics,
  });
  const development = developmentReader({ links: repos.gitLinks, entities: repos.gitEntities });
  const issues = issuesService({
    development,
    access,
    organizations: repos.organizations,
    projects: repos.projects,
    schema: repos.schema,
    issues: repos.issues,
    issueActivity: repos.issueActivity,
    issueSearch: repos.issueSearch,
    comments: repos.comments,
    tags: repos.tags,
    search,
    inTransaction: inTenantTransaction,
    analytics,
    stores,
    attachments: repos.attachments,
    sprints: repos.sprints,
    customFields: repos.customFields,
  });
  const attachments = attachmentsService({
    access,
    issues,
    issuesRepo: repos.issues,
    attachments: repos.attachments,
    comments: repos.comments,
    workItems: repos.workItems,
    articles: repos.articles,
    articlesService: () => articles,
    organizations: repos.organizations,
    inTransaction: inTenantTransaction,
    stores,
    queue: () => queue,
    filesBaseUrl: filesBaseUrl(env),
    mailer: bestEffort(mailer, error => analytics.captureException(error)),
    analytics,
    appBaseUrl: env.APP_BASE_URL,
  });
  const sprints = sprintsService({
    access,
    search,
    issuesService: issues,
    sprints: repos.sprints,
    issues: repos.issues,
    schema: repos.schema,
    inTransaction: inTenantTransaction,
    analytics,
    redis: app.redis,
    onSnapshot: orgId => reportResults.bump(orgId),
  });
  const reports = reportsService({
    access,
    search,
    reports: repos.reports,
    sprints: repos.sprints,
    issues: repos.issues,
    issueSearch: repos.issueSearch,
    savedViews: repos.savedViews,
    organizations: repos.organizations,
    workItemAttributes: repos.workItemAttributes,
    cache: reportResults,
    analytics,
    redis: app.redis,
  });
  const boards = boardsService({
    access,
    search,
    issuesService: issues,
    sprintsService: sprints,
    boards: repos.boards,
    sprints: repos.sprints,
    issues: repos.issues,
    issueSearch: repos.issueSearch,
    schema: repos.schema,
    inTransaction: inTenantTransaction,
    analytics,
    redis: app.redis,
  });
  const articles = articlesService({
    access,
    search,
    issues,
    projects: repos.projects,
    articles: repos.articles,
    articleSearch: repos.articleSearch,
    issuesRepo: repos.issues,
    tags: repos.tags,
    users: repos.users,
    inTransaction: inTenantTransaction,
    analytics,
    redis: app.redis,
    stores,
  });
  const notifications = notificationsService({
    access,
    issues,
    articles: () => articles,
    notifications: repos.notifications,
    organizations: repos.organizations,
    projects: repos.projects,
    issuesRepo: repos.issues,
    articlesRepo: repos.articles,
    analytics,
    linkSecret: emailLinkSecret(env),
  });
  const fanout = notificationFanout({
    notifications: repos.notifications,
    issueActivity: repos.issueActivity,
    issues: repos.issues,
    comments: repos.comments,
    articles: repos.articles,
    sprints: repos.sprints,
    projects: repos.projects,
    schema: repos.schema,
    organizations: repos.organizations,
    queue: () => queue,
    mailer: bestEffort(mailer, error => analytics.captureException(error)),
    analytics,
    links: { appBaseUrl: env.APP_BASE_URL, apiBaseUrl: env.API_BASE_URL, secret: emailLinkSecret(env) },
  });
  const accountLifecycle = accountLifecycleService({
    users: repos.users,
    organizations: repos.organizations,
    inTransaction: body =>
      db.transaction(tx =>
        body({
          users: usersRepository(tx),
          sessions: sessionsRepository(tx),
          tokens: personalAccessTokensRepository(tx),
          oneTimeTokens: oneTimeTokensRepository(tx),
        }),
      ),
    auth: authSvc,
    twoFactor,
    mailer,
    analytics,
  });
  const organizationLifecycle = organizationLifecycleService({
    access,
    organizations: repos.organizations,
    projects: repos.projects,
    oneTimeTokens: repos.oneTimeTokens,
    sessions: repos.sessions,
    tokens: repos.patTokens,
    attachments: repos.attachments,
    importJobs: repos.importJobs,
    exportJobs: repos.exportJobs,
    inTransaction: inTenantTransaction,
    toDto: org => organizations.toDto(org),
    twoFactor,
    auth: authSvc,
    stores,
    mailer,
    analytics,
    appBaseUrl: env.APP_BASE_URL,
  });
  const storageSvc = storageService({
    access,
    organizations: repos.organizations,
    projects: repos.projects,
    issuesRepo: repos.issues,
    attachments: repos.attachments,
    configs: repos.storageConfigs,
    locations: repos.storageLocations,
    attachmentsService: attachments,
    inTransaction: inTenantTransaction,
    storage,
    stores,
    twoFactor,
    masterKey: encryptionMasterKey(env),
    queue: () => queue,
    analytics,
    log: app.log,
    appBaseUrl: env.APP_BASE_URL,
    filesBaseUrl: filesBaseUrl(env),
    allowAnyEndpoint: env.BYO_ALLOW_ANY_ENDPOINT,
  });
  const imports = importsService({
    access,
    issues,
    importJobs: repos.importJobs,
    organizations: repos.organizations,
    customFields: repos.customFields,
    storage,
    queue: () => queue,
    analytics,
    onIssuesWritten: orgId => reportResults.bump(orgId),
  });
  const exports = exportsService({
    access,
    exportJobs: repos.exportJobs,
    orgExport: repos.orgExport,
    organizations: repos.organizations,
    projects: repos.projects,
    issues,
    storage,
    stores,
    inTransaction: inTenantTransaction,
    queue: () => queue,
    mailer: bestEffort(mailer, error => analytics.captureException(error)),
    analytics,
    appBaseUrl: env.APP_BASE_URL,
  });
  const gitProviders = createProviders({
    fetch: guardedFetch(
      opts.gitFetch ?? ((url, init) => fetch(url, init)),
      opts.gitResolveHost ?? dnsResolveHost,
      env.GIT_ALLOW_PRIVATE_HOSTS,
    ),
    now: () => new Date(),
    githubApp: githubApp(env),
  });
  const gitConnections = gitConnectionsService({
    access,
    providers: gitProviders,
    connections: repos.gitConnections,
    repositories: repos.gitRepositories,
    organizations: repos.organizations,
    inTransaction: inTenantTransaction,
    store: app.redis,
    mailer: bestEffort(mailer, error => analytics.captureException(error)),
    analytics,
    masterKey: encryptionMasterKey(env),
    apiBaseUrl: env.API_BASE_URL,
    appBaseUrl: env.APP_BASE_URL,
    allowPrivateHosts: env.GIT_ALLOW_PRIVATE_HOSTS,
    resolveHost: opts.gitResolveHost ?? dnsResolveHost,
  });
  const gitLinker = gitLinksService({
    providers: gitProviders,
    repositories: repos.gitRepositories,
    entities: repos.gitEntities,
    links: repos.gitLinks,
    identities: repos.gitIdentities,
    users: repos.users,
    organizations: repos.organizations,
    inTransaction: inTenantTransaction,
    masterKey: encryptionMasterKey(env),
    appBaseUrl: env.APP_BASE_URL,
  });
  const gitRepositories = gitRepositoriesService({
    linker: gitLinker,
    queue: () => queue,
    access,
    providers: gitProviders,
    connections: repos.gitConnections,
    repositories: repos.gitRepositories,
    organizations: repos.organizations,
    projects: repos.projects,
    inTransaction: inTenantTransaction,
    analytics,
    masterKey: encryptionMasterKey(env),
    apiBaseUrl: env.API_BASE_URL,
  });
  const gitIngest = gitIngestService({
    access,
    providers: gitProviders,
    connections: repos.gitConnections,
    repositories: repos.gitRepositories,
    events: repos.gitEvents,
    connectionsService: gitConnections,
    applyEntities: (ctx, connection, repository, events, row) =>
      gitLinker.applyEntities(ctx, connection, repository, events, row),
    counter: app.redis,
    queue: () => queue,
    analytics,
    masterKey: encryptionMasterKey(env),
    log: app.log,
  });
  const gitDevelopment = gitDevelopmentService({
    access,
    issues,
    providers: gitProviders,
    connections: repos.gitConnections,
    repositories: repos.gitRepositories,
    entities: repos.gitEntities,
    links: repos.gitLinks,
    organizations: repos.organizations,
    reader: development,
    linker: gitLinker,
    inTransaction: inTenantTransaction,
  });
  const services = {
    auth: authSvc,
    tenancy,
    me,
    accounts,
    oauth: oauthService({
      clients: opts.oauthClients ?? createOAuthClients(env),
      accounts,
      store: app.redis,
      appBaseUrl: env.APP_BASE_URL,
    }),
    sessions,
    organizations,
    invitations,
    members: membersService({
      ...orgDeps,
      organizations: repos.organizations,
      projects: repos.projects,
      tokens: repos.patTokens,
      issues: repos.issues,
      comments: repos.comments,
      workItems: repos.workItems,
      savedViews: repos.savedViews,
    }),
    projects: projectsService({
      ...orgDeps,
      organizations: repos.organizations,
      projects: repos.projects,
      customFields: repos.customFields,
    }),
    activity: activityService({ activity: repos.activity, organizations: repos.organizations, access }),
    schema: projectSchemaService({ schema: repos.schema, access, inTransaction: inTenantTransaction }),
    customFields: customFieldsService({
      access,
      customFields: repos.customFields,
      schema: repos.schema,
      projects: repos.projects,
      organizations: repos.organizations,
      inTransaction: inTenantTransaction,
      analytics,
    }),
    workItemAttributes: workItemAttributesService({
      access,
      workItemAttributes: repos.workItemAttributes,
      inTransaction: inTenantTransaction,
      analytics,
    }),
    search,
    issues,
    comments: commentsService({
      access,
      issues,
      comments: repos.comments,
      inTransaction: inTenantTransaction,
      analytics,
    }),
    workItems: workItemsService({
      access,
      issues,
      issuesRepo: repos.issues,
      organizations: repos.organizations,
      projects: repos.projects,
      schema: repos.schema,
      workItems: repos.workItems,
      workItemAttributes: repos.workItemAttributes,
      inTransaction: inTenantTransaction,
      analytics,
    }),
    links: issueLinksService({
      issues,
      issuesRepo: repos.issues,
      issueLinks: repos.issueLinks,
      inTransaction: inTenantTransaction,
      analytics,
    }),
    tags: tagsService({
      access,
      issues,
      issuesRepo: repos.issues,
      tags: repos.tags,
      articles,
      articleSearch: repos.articleSearch,
      projects: repos.projects,
      customFields: repos.customFields,
      inTransaction: inTenantTransaction,
      analytics,
    }),
    savedViews: savedViewsService({
      access,
      search,
      savedViews: repos.savedViews,
      issues: repos.issues,
      analytics,
    }),
    home: homeService({
      access,
      organizations: repos.organizations,
      projects: repos.projects,
      preferences: repos.preferences,
    }),
    tokens: tokensService({
      tokens: repos.patTokens,
      inTransaction: body => db.transaction(tx => body({ tokens: personalAccessTokensRepository(tx) })),
      projects: repos.projects,
      organizations: repos.organizations,
      users: repos.users,
      mailer,
      analytics,
      appBaseUrl: env.APP_BASE_URL,
    }),
  };

  await app.register(auth, {
    resolvePrincipal: services.auth.resolvePrincipal,
    cookieDomain: env.SESSION_COOKIE_DOMAIN,
  });
  await app.register(originCheck, { allowedOrigin: env.APP_BASE_URL });
  await app.register(idempotency, {
    store: redisIdempotencyStore(app.redis),
    recheckAccess: async (principal, { orgIds, projects }) => {
      const orgs = new Map<number, Awaited<ReturnType<typeof access.orgById>>>();
      for (const orgId of new Set([...orgIds, ...projects.map(([orgId]) => orgId)])) {
        orgs.set(orgId, await access.orgById(principal, orgId));
      }
      for (const [orgId, projectId] of projects) await access.projectById(principal, orgs.get(orgId)!, projectId);
    },
  });
  await app.register(rateLimit, {
    timeWindow: RATE_LIMIT_WINDOW_MS,
    redis: app.redis,
    nameSpace: opts.rateLimitNamespace ?? 'rl:',
    skipOnError: true, // a Redis outage degrades to no limiting, not a 500 on every request
    // Agents burst in ways humans do not, so PATs and sessions get separate buckets.
    keyGenerator: request => {
      const p = request.principal;
      if (p?.via === 'session') return `s:${p.sessionId}`;
      if (p?.via === 'pat') return `t:${p.tokenId}`;
      return `ip:${request.ip}`;
    },
    max: request => {
      const p = request.principal;
      if (p?.via === 'pat') return RATE_LIMIT_MAX_PER_PAT;
      if (p?.via === 'session') return RATE_LIMIT_MAX_PER_SESSION;
      return RATE_LIMIT_MAX_ANONYMOUS;
    },
  });

  await app.register(healthRoutes, { db, storage, ...(opts.now ? { now: opts.now } : {}) });
  await app.register(avatarsRoutes);
  await app.register(authRoutes, {
    accounts: services.accounts,
    me: services.me,
    oauth: services.oauth,
    cookie: { secure: env.NODE_ENV === 'production', domain: env.SESSION_COOKIE_DOMAIN },
  });
  await app.register(meRoutes, {
    accounts: services.accounts,
    lifecycle: accountLifecycle,
    twoFactor,
    cookieDomain: env.SESSION_COOKIE_DOMAIN,
    me: services.me,
    home: services.home,
    sessions: services.sessions,
    tokens: services.tokens,
  });

  await app.register(organizationsRoutes, { organizations: services.organizations, lifecycle: organizationLifecycle });
  await app.register(ownershipTransfersRoutes, { lifecycle: organizationLifecycle });
  await app.register(storageRoutes, { storage: storageSvc });
  await app.register(importsRoutes, { imports });
  await app.register(exportsRoutes, { exports });
  await app.register(membersRoutes, { members: services.members });
  await app.register(activityRoutes, { activity: services.activity });
  await app.register(projectsRoutes, { projects: services.projects });
  await app.register(invitationsRoutes, { invitations: services.invitations });
  await app.register(projectSchemaRoutes, { schema: services.schema });
  await app.register(customFieldsRoutes, { customFields: services.customFields });
  await app.register(workItemAttributesRoutes, { workItemAttributes: services.workItemAttributes });
  await app.register(issuesRoutes, { issues: services.issues, search: services.search });
  await app.register(commentsRoutes, { comments: services.comments });
  await app.register(workItemsRoutes, { workItems: services.workItems });
  await app.register(attachmentsRoutes, { attachments });
  await app.register(filesRoutes, {
    attachments,
    mountPath: new URL(filesBaseUrl(env)).pathname.replace(/\/$/, ''),
  });
  await app.register(issueLinksRoutes, { links: services.links });
  await app.register(tagsRoutes, { tags: services.tags });
  await app.register(searchRoutes, { search: services.search, articles });
  await app.register(articlesRoutes, {
    articles,
    comments: articleCommentsService({
      access,
      articles,
      comments: repos.comments,
      inTransaction: inTenantTransaction,
      analytics,
    }),
    attachments,
  });
  await app.register(savedViewsRoutes, { savedViews: services.savedViews });
  await app.register(sprintsRoutes, { sprints });
  await app.register(boardsRoutes, { boards });
  await app.register(reportsRoutes, { reports });
  await app.register(notificationsRoutes, { notifications });
  await app.register(gitRoutes, {
    connections: gitConnections,
    repositories: gitRepositories,
    ingest: gitIngest,
    development: gitDevelopment,
    cookie: { secure: env.NODE_ENV === 'production', domain: env.SESSION_COOKIE_DOMAIN },
  });
  await app.register(gitWebhookRoutes, { ingest: gitIngest, ...(opts.now ? { now: opts.now } : {}) });
  await app.register(mcpRoutes, {
    apiBaseUrl: env.MCP_API_BASE_URL ?? `http://127.0.0.1:${env.PORT}`,
    appBaseUrl: env.APP_BASE_URL,
    fetch: opts.mcpFetch ?? (request => fetch(request)),
    confirmationKey: subkey(encryptionMasterKey(env), 'mcp-confirm'),
    onToolCall: (event, caller) => analytics.capture('mcp_tool_called', event, { userId: caller.userId }),
  });

  const gcContext = { kind: 'system' as const, reason: 'scheduled garbage collection has no actor' };
  const jobHandlers: JobHandlers = {
    'session.gc': () => repos.sessions.deleteExpired(gcContext),
    'tokens.gc': () => repos.oneTimeTokens.deleteExpired(gcContext),
    'issues.purge': async () => (await services.issues.purgeExpired()) + (await articles.purgeExpired()),
    'attachments.sweep': () => attachments.sweepExpired(),
    'sprint.snapshot': () => sprints.snapshotActive(),
    'notifications.due': now => fanout.due(now),
    'email.digest': now => fanout.digest(now),
    'notifications.purge': now => fanout.purge(now),
    'org.deletion_reminder': now => organizationLifecycle.remindDeletions(now),
    'org.delete': now => organizationLifecycle.deleteDue(now),
    'storage.reconcile': now => storageSvc.reconcile(now),
    'transfers.sweep': async now => (await imports.sweep(now)) + (await exports.sweep(now)),
    'git.purge': async now => (await gitIngest.purge(now)) + (await gitLinker.purge(now)),
    'git.reconcile': now => gitRepositories.reconcileAll(now),
  };
  const queuedHandlers: QueuedHandlers = {
    'notify.fanout': (job, now) => fanout.fanout(job, now),
    'avatar.mirror': job => avatars.run(job.user_id),
    'storage.migrate': (job, now) => storageSvc.migrate(job, now),
    'import.csv': (job, now) => imports.run(job, now),
    'export.org': (job, now) => exports.run(job, now),
    'git.process_events': (job, now) => gitIngest.drain(job, now),
    'git.backfill': job => gitRepositories.backfill(job),
  };
  // Route tests run a job the way the schedule would, without pg-boss.
  app.decorate('jobHandlers', jobHandlers);
  app.decorate('accountLifecycle', accountLifecycle);
  app.decorate('queuedHandlers', queuedHandlers);

  if (opts.jobs ?? env.NODE_ENV !== 'test') {
    const jobs = await startJobs(env.DATABASE_URL, jobHandlers, queuedHandlers, app.log);
    queue = jobs.queue;
    app.addHook('onClose', async () => {
      await jobs.stop();
    });
  }

  return app;
}
