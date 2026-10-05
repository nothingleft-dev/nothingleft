import type { Comment, CreateComment, ToggleTask, UpdateComment } from '@nothingleft/types';
import { api } from '@lib/api/client';

const base = (key: string) => `/v1/issues/${encodeURIComponent(key)}/comments`;

export const listComments = (key: string, cursor?: string) =>
  api.get<Comment[]>(base(key), { query: { cursor, limit: 50 } });

export const createComment = (key: string, body: CreateComment, idempotencyKey?: string) =>
  api.post<Comment>(base(key), { body, idempotencyKey });

export const updateComment = (key: string, id: number, body: UpdateComment) =>
  api.patch<Comment>(`${base(key)}/${id}`, { body });

export const deleteComment = (key: string, id: number) => api.delete<Comment>(`${base(key)}/${id}`);

export const toggleCommentTask = (key: string, id: number, body: ToggleTask) =>
  api.post<Comment>(`${base(key)}/${id}/tasks/toggle`, { body });
