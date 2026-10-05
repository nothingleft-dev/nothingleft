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
export const useUpdatePreferences = () => useMeMutation((body: UpdatePreferences) => updatePreferences(body));
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
