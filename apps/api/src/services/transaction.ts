import type {
  ArticlesRepository,
  AttachmentsRepository,
  BoardsRepository,
  CommentsRepository,
  CustomFieldsRepository,
  InvitationsRepository,
  IssueActivityRepository,
  IssueLinksRepository,
  IssuesRepository,
  OneTimeTokensRepository,
  OrganizationPurgeRepository,
  OrganizationsRepository,
  OrgActivityRepository,
  OrgStorageConfigsRepository,
  ProjectSchemaRepository,
  ProjectsRepository,
  SavedViewsRepository,
  SprintsRepository,
  TagsRepository,
  UsersRepository,
  WorkItemsRepository,
  WorkItemAttributesRepository,
} from '@nothingleft/db';

/** The repositories an organisation-shaped write needs, rebound to one transaction by app.ts. */
export interface TenantRepos {
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  invitations: InvitationsRepository;
  activity: OrgActivityRepository;
  users: UsersRepository;
  schema: ProjectSchemaRepository;
  issues: IssuesRepository;
  issueActivity: IssueActivityRepository;
  comments: CommentsRepository;
  issueLinks: IssueLinksRepository;
  tags: TagsRepository;
  workItems: WorkItemsRepository;
  attachments: AttachmentsRepository;
  storageConfigs: OrgStorageConfigsRepository;
  savedViews: SavedViewsRepository;
  sprints: SprintsRepository;
  boards: BoardsRepository;
  customFields: CustomFieldsRepository;
  workItemAttributes: WorkItemAttributesRepository;
  articles: ArticlesRepository;
  oneTimeTokens: OneTimeTokensRepository;
  organizationPurge: OrganizationPurgeRepository;
}

export type InTenantTransaction = <T>(body: (repos: TenantRepos) => Promise<T>) => Promise<T>;
