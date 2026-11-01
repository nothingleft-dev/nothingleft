'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Me, UpdateMe, UpdatePreferences } from '@nothingleft/types';
import { completeAvatar, presignAvatar, removeAvatar, updateMe, updatePreferences } from '@lib/api/me';
import { putPresigned } from '@lib/api/storage';
import { queryKeys } from '@lib/query/keys';

function useMeMutation<TInput>(fn: (input: TInput) => Promise<{ data: Me }>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => fn(input).then(r => r.data),
    onSuccess: me => client.setQueryData(queryKeys.me(), me),
  });
}

export const useUpdateMe = () => useMeMutation((body: UpdateMe) => updateMe(body));
// The theme lands in the cached Me before the request does: useAccountTheme reverts the device to
// whatever Me holds, so a stale copy there flips the page back until the save returns.
export function useUpdatePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePreferences) => updatePreferences(body).then(r => r.data),
    onMutate: async ({ theme }) => {
      if (!theme) return undefined;
      await client.cancelQueries({ queryKey: queryKeys.me() });
      const before = client.getQueryData<Me>(queryKeys.me());
      if (before) client.setQueryData<Me>(queryKeys.me(), { ...before, preferences: { ...before.preferences, theme } });
      return before;
    },
    onError: (_error, _body, before) => {
      if (before) client.setQueryData(queryKeys.me(), before);
    },
    onSuccess: me => client.setQueryData(queryKeys.me(), me),
  });
}
export const useRemoveAvatar = () => useMeMutation(() => removeAvatar());

export function useUploadAvatar() {
  return useMeMutation(async (file: File) => {
    const { data: presign } = await presignAvatar({
      mime: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
      size: file.size,
    });
    await putPresigned(presign.upload_url, file);
    return completeAvatar(presign.object_key);
  });
}
