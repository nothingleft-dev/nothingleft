import type { ExportJob } from '@nothingleft/types';
import { api, buildUrl } from '@lib/api/client';

const exports = (slug: string) => `/v1/organizations/${encodeURIComponent(slug)}/exports`;

export const listExports = (slug: string) => api.get<ExportJob[]>(exports(slug));

export const requestExport = (slug: string) => api.post<ExportJob>(exports(slug));

// A plain link: the API answers with a 302 to a presigned URL, which only a navigation follows with the session cookie.
export const exportDownloadHref = (job: ExportJob) => (job.download_url ? buildUrl(job.download_url).toString() : null);
