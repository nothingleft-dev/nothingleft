import type {
  ApplyTags,
  Article,
  ArticleChildrenOnDelete,
  ArticleComment,
  ArticleNode,
  ArticleSummary,
  Attachment,
  CreateArticle,
  CreateComment,
  GlobalSearchResult,
  ToggleTask,
  UpdateArticle,
  UpdateComment,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const tree = (project: string) => `/v1/projects/${encodeURIComponent(project)}/articles`;
const base = (project: string, slug: string) => `${tree(project)}/${encodeURIComponent(slug)}`;

export type ArticleSignal = 'star' | 'watch';

export const listArticleTree = (project: string) => api.get<ArticleNode[]>(tree(project));

export const listDeletedArticles = (project: string) =>
  api.get<ArticleNode[]>(tree(project), { query: { deleted: true } });

export const getArticle = (project: string, slug: string) => api.get<Article>(base(project, slug));

export const createArticle = (project: string, body: CreateArticle, idempotencyKey?: string) =>
  api.post<Article>(tree(project), { body, idempotencyKey });

export const updateArticle = (project: string, slug: string, body: UpdateArticle) =>
  api.patch<Article>(base(project, slug), { body });

export const deleteArticle = (project: string, slug: string, children?: ArticleChildrenOnDelete) =>
  api.delete<Article>(base(project, slug), { query: { children } });

export const restoreArticle = (project: string, slug: string) => api.post<Article>(`${base(project, slug)}/restore`);

export const setArticleSignal = (project: string, slug: string, signal: ArticleSignal, on: boolean) =>
  on ? api.put<Article>(`${base(project, slug)}/${signal}`) : api.delete<Article>(`${base(project, slug)}/${signal}`);

export const applyArticleTags = (project: string, slug: string, body: ApplyTags) =>
  api.post<Article>(`${base(project, slug)}/tags`, { body });

export const removeArticleTag = (project: string, slug: string, tag: string) =>
  api.delete<Article>(`${base(project, slug)}/tags/${encodeURIComponent(tag)}`);

export const toggleArticleTask = (project: string, slug: string, body: ToggleTask) =>
  api.post<Article>(`${base(project, slug)}/tasks/toggle`, { body });

export const listArticleAttachments = (project: string, slug: string) =>
  api.get<Attachment[]>(`${base(project, slug)}/attachments`);

const comments = (project: string, slug: string) => `${base(project, slug)}/comments`;

export const listArticleComments = (project: string, slug: string, cursor?: string) =>
  api.get<ArticleComment[]>(comments(project, slug), { query: { cursor, limit: 50 } });

export const createArticleComment = (project: string, slug: string, body: CreateComment, idempotencyKey?: string) =>
  api.post<ArticleComment>(comments(project, slug), { body, idempotencyKey });

export const updateArticleComment = (project: string, slug: string, id: number, body: UpdateComment) =>
  api.patch<ArticleComment>(`${comments(project, slug)}/${id}`, { body });

export const deleteArticleComment = (project: string, slug: string, id: number) =>
  api.delete<ArticleComment>(`${comments(project, slug)}/${id}`);

export const toggleArticleCommentTask = (project: string, slug: string, id: number, body: ToggleTask) =>
  api.post<ArticleComment>(`${comments(project, slug)}/${id}/tasks/toggle`, { body });

export interface ArticleSearchQuery {
  q?: string;
  project?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export const searchArticles = (query: ArticleSearchQuery, signal?: AbortSignal) =>
  api.get<ArticleSummary[]>('/v1/articles', {
    query: {
      q: query.q || undefined,
      project: query.project,
      sort: query.sort || undefined,
      limit: query.limit,
      offset: query.offset,
    },
    signal,
  });

export const listReferencingArticles = (issueKey: string) =>
  api.get<ArticleSummary[]>(`/v1/issues/${encodeURIComponent(issueKey)}/articles`);

export const searchEverything = (q: string, signal?: AbortSignal) =>
  api.get<GlobalSearchResult>('/v1/search', { query: { q }, signal });
