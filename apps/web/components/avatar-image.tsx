'use client';

import { useState, type ComponentProps } from 'react';
import { AvatarImage as BaseAvatarImage } from '@components/ui/avatar';

/**
 * The primitive shows its fallback only when its own preload fails; an <img> that loaded once and then
 * failed (a refused or evicted request) stayed a broken-image glyph. Dropping the source hands over to the fallback.
 */
export function AvatarImage({ src, onError, ...props }: ComponentProps<typeof BaseAvatarImage>) {
  const [failed, setFailed] = useState<typeof src | null>(null);
  return (
    <BaseAvatarImage
      {...props}
      src={src && src !== failed ? src : undefined}
      onError={event => {
        setFailed(src);
        onError?.(event);
      }}
    />
  );
}
