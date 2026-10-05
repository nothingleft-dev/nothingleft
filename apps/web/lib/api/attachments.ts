import type { Attachment, AttachmentPresign, PresignAttachment } from '@nothingleft/types';
import { api } from '@lib/api/client';

const issueBase = (key: string) => `/v1/issues/${encodeURIComponent(key)}`;

export const presignAttachment = (body: PresignAttachment) =>
  api.post<AttachmentPresign>('/v1/attachments/presign', { body });

export const completeAttachment = (id: string) => api.post<Attachment>(`/v1/attachments/${id}/complete`);

export const deleteAttachment = (id: string) => api.delete<Attachment>(`/v1/attachments/${id}`);

export const listIssueAttachments = (key: string) => api.get<Attachment[]>(`${issueBase(key)}/attachments`);
