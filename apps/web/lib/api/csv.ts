import { ErrorEnvelopeSchema } from '@nothingleft/types';
import { buildUrl, type QueryEntry } from '@lib/api/client';
import { ApiError, ApiNetworkError } from '@lib/api/errors';

export interface CsvDownload {
  blob: Blob;
  filename: string;
}

const FILENAME = /filename="?([^";]+)"?/i;

/**
 * A CSV is the one success without an envelope (api-conventions.md § Rules), so it cannot
 * go through client.ts. Its errors are still envelopes, which is why they are parsed here.
 */
export async function downloadCsv(
  path: string,
  query: Record<string, QueryEntry>,
  fallbackFilename: string,
): Promise<CsvDownload> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { credentials: 'include', headers: { accept: 'text/csv' } });
  } catch {
    throw new ApiNetworkError('offline');
  }

  const requestId = response.headers.get('x-request-id');

  if (!response.ok) {
    const parsed = ErrorEnvelopeSchema.safeParse(await response.json().catch(() => null));
    throw parsed.success
      ? ApiError.fromBody(response.status, parsed.data.error)
      : new ApiError(response.status, 'unknown', response.statusText, requestId);
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  return { blob: await response.blob(), filename: FILENAME.exec(disposition)?.[1] ?? fallbackFilename };
}
