'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { formatBytes } from '@nothingleft/format';
import { ATTACHMENT_MAX_BYTES, type Attachment } from '@nothingleft/types';
import { useOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';
import { completeAttachment, deleteAttachment, listIssueAttachments, presignAttachment } from '@lib/api/attachments';
import { ApiNetworkError, isApiError } from '@lib/api/errors';
import { StorageUploadError, putUpload } from '@lib/api/storage';
import { imageDimensions, isInlineImage, mimeOf, sha256Base64 } from '@lib/files';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useIssueAttachments(key: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.issueAttachments(key),
    refetchInterval: POLL.list,
    queryFn: () => listIssueAttachments(key).then(r => r.data),
    enabled,
  });
}

/** The current organisation's quota, and whether this server can take uploads at all. */
export function useStorage() {
  const session = useSession();
  const slug = session.status === 'signed-in' ? session.user.current_organization_slug : null;
  const organization = useOrganization(slug);
  const unavailable = useQuery({
    queryKey: queryKeys.storageUnavailable(),
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
  });
  const storage = organization.data?.storage ?? null;
  const membership = organization.data?.membership;
  const canManage = membership?.org_role === 'org_admin' || membership?.is_owner === true;
  // Unknown while the organisation loads: allowed, since a real 503 still switches uploads off.
  const blocked =
    storage?.configured === false || unavailable.data
      ? 'File storage is not configured on this server.'
      : storage?.bring_your_own === 'failed'
        ? canManage
          ? BYO_UPLOADS_PAUSED_ADMIN
          : BYO_UPLOADS_PAUSED
        : null;
  return { storage, available: blocked === null, blocked, slug, canManage };
}

const BYO_UPLOADS_PAUSED_ADMIN =
  'Uploads are paused: the organisation’s own storage bucket refused its key. Update the key under Organisation → Storage.';

const BYO_UPLOADS_PAUSED =
  'Uploads are paused: the organisation’s own storage bucket refused its key. An organisation admin can update the key in organisation settings.';

function refreshAfterWrite(client: QueryClient, issue: string | null, article?: Attachment['article']) {
  void client.invalidateQueries({ queryKey: queryKeys.organizations() });
  if (article) {
    void client.invalidateQueries({ queryKey: queryKeys.articleAttachments(article.project, article.slug) });
    void client.invalidateQueries({ queryKey: queryKeys.article(article.project, article.slug), exact: true });
  }
  if (!issue) return;
  void client.invalidateQueries({ queryKey: queryKeys.issueAttachments(issue) });
  void client.invalidateQueries({ queryKey: queryKeys.issueActivity(issue) });
  void client.invalidateQueries({ queryKey: queryKeys.issue(issue), exact: true });
}

export function useDeleteAttachment(issueKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id).then(r => r.data),
    onMutate: async id => {
      const key = queryKeys.issueAttachments(issueKey);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Attachment[]>(key);
      client.setQueryData<Attachment[]>(key, rows => rows?.filter(a => a.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(queryKeys.issueAttachments(issueKey), context.previous);
    },
    onSettled: () => refreshAfterWrite(client, issueKey),
  });
}

/** Deletes drafts nobody will claim; best effort, since the sweep removes them after two days anyway. */
export function useDiscardDrafts() {
  const client = useQueryClient();
  return useCallback(
    (files: readonly Attachment[]) => {
      if (files.length === 0) return;
      void Promise.allSettled(files.map(f => deleteAttachment(f.id))).then(() => refreshAfterWrite(client, null));
    },
    [client],
  );
}

/**
 * An existing issue (optionally one of its comments or work items), an article (optionally one of its
 * comments), or a draft for a form not yet saved.
 */
export type UploadTarget =
  | { issue: string; comment_id?: number; work_item_id?: number }
  | { project: string; article: string; comment_id?: number }
  | { project: string };

export type UploadStatus = 'preparing' | 'uploading' | 'completing' | 'done' | 'failed';

export interface Upload {
  id: string;
  file: File;
  mime: string;
  image: boolean;
  /** What the text holds until the file is stored: a blob URL for an image (it previews), a fragment otherwise. */
  placeholder: string;
  loaded: number;
  status: UploadStatus;
  error: string | null;
  retryable: boolean;
  attachment: Attachment | null;
}

export const isUploadActive = (upload: Upload) => upload.status !== 'done' && upload.status !== 'failed';

const RETRYABLE_CODES = new Set(['attachment.upload_missing', 'attachment.upload_mismatch']);

const isRetryable = (error: unknown) =>
  error instanceof StorageUploadError ||
  error instanceof ApiNetworkError ||
  (isApiError(error) && (RETRYABLE_CODES.has(error.code) || (error.status >= 500 && error.status !== 503)));

const messageOf = (error: unknown) =>
  isApiError(error) || error instanceof ApiNetworkError || error instanceof StorageUploadError
    ? error.message
    : 'The file could not be uploaded.';

const PRELOAD_TIMEOUT_MS = 10_000;

const preload = (url: string) =>
  new Promise<void>(resolve => {
    const image = new Image();
    const done = () => resolve();
    image.onload = done;
    image.onerror = done;
    setTimeout(done, PRELOAD_TIMEOUT_MS);
    image.src = url;
  });

/** A problem found before anything is sent: the API would refuse it with the same words. */
function refusal(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}. Files can be at most ${formatBytes(ATTACHMENT_MAX_BYTES)}.`;
  }
  return null;
}

/**
 * presign → PUT → complete for any number of files at once, each with its own progress, cancel and
 * retry. Several editors may each hold one; they never share.
 */
export function useUploader(target: UploadTarget | null) {
  const client = useQueryClient();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const latest = useRef({ target, uploads });
  useEffect(() => {
    latest.current = { target, uploads };
  });
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback(
    (id: string, next: Partial<Upload>) => setUploads(list => list.map(u => (u.id === id ? { ...u, ...next } : u))),
    [],
  );

  const run = useCallback(
    async (upload: Upload) => {
      const destination = latest.current.target;
      if (!destination) return;
      const controller = new AbortController();
      controllers.current.set(upload.id, controller);
      let pendingId: string | null = null;
      const { file } = upload;
      try {
        patch(upload.id, { status: 'preparing', loaded: 0, error: null, retryable: false, attachment: null });
        const [sha256, size] = await Promise.all([sha256Base64(file), imageDimensions(file)]);
        if (controller.signal.aborted) return;
        const presign = (
          await presignAttachment({
            ...destination,
            filename: file.name,
            mime: upload.mime,
            size: file.size,
            sha256,
            ...(size ?? {}),
          })
        ).data;
        pendingId = presign.attachment.id;
        if (controller.signal.aborted) throw controller.signal.reason;
        patch(upload.id, { status: 'uploading', attachment: presign.attachment });
        await putUpload(presign.upload_url, file, {
          headers: presign.upload_headers,
          signal: controller.signal,
          onProgress: loaded => patch(upload.id, { loaded }),
        });
        patch(upload.id, { status: 'completing', loaded: file.size });
        const ready = (await completeAttachment(pendingId)).data;
        // Cancelled while completing: the file is stored now, so it has to go the way it came.
        if (controller.signal.aborted) throw controller.signal.reason;
        pendingId = null;
        // Swapping the local preview for a URL the browser has not fetched yet would blank the image.
        if (upload.image) await preload(ready.url);
        patch(upload.id, { status: 'done', attachment: ready });
        refreshAfterWrite(client, ready.issue, ready.article);
      } catch (error) {
        // A pending row holds quota and a place among the issue's 50 until the sweep; give both back now.
        if (pendingId) void deleteAttachment(pendingId).catch(() => undefined);
        if (controller.signal.aborted) return;
        if (isApiError(error) && error.code === 'storage.not_configured') {
          client.setQueryData(queryKeys.storageUnavailable(), true);
        }
        // The bucket started refusing its key since the organisation was read: redraw the banners and controls.
        if (isApiError(error) && error.code === 'storage.byo_unavailable') {
          void client.invalidateQueries({ queryKey: queryKeys.organizations() });
        }
        patch(upload.id, { status: 'failed', error: messageOf(error), retryable: isRetryable(error) });
      } finally {
        controllers.current.delete(upload.id);
      }
    },
    [client, patch],
  );

  const start = useCallback(
    (files: readonly File[]): Upload[] => {
      const created = files.map((file): Upload => {
        const mime = mimeOf(file);
        const image = isInlineImage(mime);
        const id = crypto.randomUUID();
        const problem = refusal(file);
        return {
          id,
          file,
          mime,
          image,
          placeholder: image && !problem ? URL.createObjectURL(file) : `#uploading-${id}`,
          loaded: 0,
          status: problem ? 'failed' : 'preparing',
          error: problem,
          retryable: false,
          attachment: null,
        };
      });
      setUploads(list => [...list, ...created]);
      for (const upload of created) if (upload.status !== 'failed') void run(upload);
      return created;
    },
    [run],
  );

  const forget = useCallback((ids: readonly string[]) => {
    const gone = new Set(ids);
    for (const upload of latest.current.uploads) {
      if (!gone.has(upload.id)) continue;
      controllers.current.get(upload.id)?.abort();
      if (upload.placeholder.startsWith('blob:')) URL.revokeObjectURL(upload.placeholder);
    }
    setUploads(list => list.filter(u => !gone.has(u.id)));
  }, []);

  const retry = useCallback(
    (id: string) => {
      const upload = latest.current.uploads.find(u => u.id === id);
      if (upload?.status === 'failed' && upload.retryable) void run(upload);
    },
    [run],
  );

  const ready = useMemo(() => uploads.filter(u => u.status === 'done' && u.attachment), [uploads]);

  /** Drafts the saved text still links to, for `attachment_ids`. */
  const claimable = useCallback(
    (text: string) =>
      latest.current.uploads
        .filter(u => u.status === 'done' && u.attachment && text.includes(u.attachment.url))
        .map(u => u.attachment!.id),
    [],
  );

  /**
   * After a save (or a discard): drafts the text no longer links to are deleted rather than
   * left for the two-day sweep (owner, 25 Sep 2026); every entry is cleared.
   */
  const finish = useCallback(
    (text: string) => {
      const { target: destination, uploads: current } = latest.current;
      if (destination && 'project' in destination && !('article' in destination)) {
        for (const u of current) {
          if (u.status === 'done' && u.attachment && !text.includes(u.attachment.url)) {
            void deleteAttachment(u.attachment.id).then(
              () => refreshAfterWrite(client, null),
              () => undefined,
            );
          }
        }
      }
      forget(current.filter(u => !isUploadActive(u)).map(u => u.id));
    },
    [client, forget],
  );

  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running.values()) controller.abort();
    };
  }, []);

  return {
    uploads,
    busy: uploads.some(isUploadActive),
    ready,
    start,
    retry,
    /** Stops an upload in flight, or drops a finished or failed entry. */
    cancel: (id: string) => forget([id]),
    claimable,
    finish,
  };
}

export type Uploader = ReturnType<typeof useUploader>;
