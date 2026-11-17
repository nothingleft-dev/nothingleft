'use client';

import type { GitAuthor, GitProviderKind } from '@nothingleft/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PersonName } from '@components/former-member-chip';
import { ProviderGlyph } from '@components/git/provider-glyph';
import { cn } from '@lib/utils';

const nameOf = (author: GitAuthor) => author.member?.name ?? author.login ?? author.name ?? 'Unknown author';

/** A member when the provider identity maps to one; otherwise the provider's login, marked by the name beside it. */
export function GitAuthorAvatar({ author, className = 'size-avatar-sm' }: { author: GitAuthor; className?: string }) {
  if (author.member) return <MemberAvatar member={author.member} className={className} />;
  return <MemberAvatar member={{ name: nameOf(author), avatar_url: author.avatar_url }} className={className} />;
}

export function GitAuthorName({
  author,
  provider,
  className,
}: {
  author: GitAuthor;
  provider: GitProviderKind;
  className?: string;
}) {
  if (author.member) return <PersonName person={author.member} className={className} />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex min-w-0 cursor-help items-center gap-1', className)}>
          <span className="truncate">{author.login ? `@${author.login}` : nameOf(author)}</span>
          <ProviderGlyph provider={provider} className="size-3 text-text-muted" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Not linked to a member{author.name && author.login ? ` · ${author.name}` : ''}</TooltipContent>
    </Tooltip>
  );
}

export function GitAuthorLine({
  author,
  provider,
  className,
}: {
  author: GitAuthor;
  provider: GitProviderKind;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <GitAuthorAvatar author={author} className="size-5" />
      <GitAuthorName author={author} provider={provider} />
    </span>
  );
}
