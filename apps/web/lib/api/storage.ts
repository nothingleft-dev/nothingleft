// Bytes never pass through the API: the browser PUTs straight to the presigned URL
// (docs/file-storage.md#principles). That is why this is a raw request rather than a
// client.ts call — there is no envelope and no session on the storage origin.
export async function putPresigned(url: string, file: File): Promise<void> {
  const response = await fetch(url, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
  if (!response.ok) throw new Error('The image could not be uploaded to storage.');
}

export class StorageUploadError extends Error {
  override readonly name = 'StorageUploadError';

  constructor(readonly status: number) {
    super(
      status === 0
        ? 'The upload was interrupted. Check your connection and try again.'
        : 'Storage refused the file. Try uploading it again.',
    );
  }
}

// The browser computes Content-Length itself and refuses to have it set.
const FORBIDDEN_HEADERS = new Set(['content-length', 'host']);

interface UploadOptions {
  headers: Record<string, string>;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/** XMLHttpRequest rather than fetch: only it reports upload progress. */
export function putUpload(url: string, file: File, { headers, onProgress, signal }: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) {
      if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = event => onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new StorageUploadError(xhr.status)));
    xhr.onerror = () => reject(new StorageUploadError(0));
    xhr.onabort = () => reject(new DOMException('The upload was cancelled.', 'AbortError'));
    if (signal?.aborted) return reject(new DOMException('The upload was cancelled.', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Refused by the network rather than by the bucket: from a browser, that is almost always a missing CORS rule. */
export class StorageCheckBlockedError extends Error {
  override readonly name = 'StorageCheckBlockedError';

  constructor(readonly request: 'upload' | 'download') {
    super(
      request === 'upload'
        ? 'This browser could not upload to the bucket.'
        : 'This browser uploaded to the bucket but could not open the file again.',
    );
  }
}

export class StorageCheckRefusedError extends Error {
  override readonly name = 'StorageCheckRefusedError';

  constructor(
    readonly request: 'upload' | 'download',
    readonly status: number,
  ) {
    super(
      request === 'upload'
        ? `The bucket refused the test upload (HTTP ${status}).`
        : `The bucket refused to hand the test file back (HTTP ${status}).`,
    );
  }
}

/** The browser half of the setup check: the same PUT an upload makes, from the app's origin. */
export async function putCheckObject(url: string, headers: Record<string, string>, body: Uint8Array<ArrayBuffer>) {
  const sent = Object.fromEntries(
    Object.entries(headers).filter(([name]) => !FORBIDDEN_HEADERS.has(name.toLowerCase())),
  );
  let response: Response;
  try {
    response = await fetch(url, { method: 'PUT', body, headers: sent });
  } catch {
    throw new StorageCheckBlockedError('upload');
  }
  if (!response.ok) throw new StorageCheckRefusedError('upload', response.status);
}

/** Reads the test file back with a signed GET, the way every file is opened. Returns its bytes. */
export async function getCheckObject(url: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', cache: 'no-store' });
  } catch {
    throw new StorageCheckBlockedError('download');
  }
  if (!response.ok) throw new StorageCheckRefusedError('download', response.status);
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new StorageCheckBlockedError('download');
  }
}
