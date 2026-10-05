'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, type Me } from '@nothingleft/types';
import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { Button } from '@components/ui/button';
import { useRemoveAvatar, useUploadAvatar } from '@hooks/use-me';
import { initialsOf } from '@lib/initials';
import { cn } from '@lib/utils';

const isAllowed = (type: string): type is (typeof AVATAR_MIME_TYPES)[number] =>
  (AVATAR_MIME_TYPES as readonly string[]).includes(type);

export function AvatarPicker({ user, size = 'md' }: { user: Me; size?: 'md' | 'lg' }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!isAllowed(file.type)) {
      toast.error('Use a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error('That image is over 2MB.');
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success('Photo updated.'),
      onError: e => toast.error(e instanceof Error ? e.message : 'The upload failed.'),
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Avatar className={cn(size === 'lg' ? 'size-14' : 'size-12')}>
        {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
        <AvatarFallback className="bg-inset font-semibold text-text-secondary">{initialsOf(user.name)}</AvatarFallback>
      </Avatar>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={remove.isPending || !user.avatar_url}
          onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success('Photo removed.') })}
        >
          Remove
        </Button>
      </div>

      <input
        ref={input}
        type="file"
        accept={AVATAR_MIME_TYPES.join(',')}
        hidden
        onChange={e => pick(e.target.files?.[0])}
      />
    </div>
  );
}
