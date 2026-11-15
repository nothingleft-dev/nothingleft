'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useParams } from 'next/navigation';
import { parseProjectKey } from '@nothingleft/format';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { FullPageState, SECONDARY_LINK } from '@components/full-page-state';
import { useProject } from '@hooks/use-projects';

// Denied and missing render identically (docs/permissions.md, rule 4).
export function NotFound({ className }: { className?: string }) {
  return (
    <FullPageState
      className={className}
      eyebrow="404"
      title="This page does not exist"
      actions={
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
      }
    >
      The address may be mistyped, or it points at something you do not have access to.
    </FullPageState>
  );
}

/** Anything missing under /projects/KEY: the project itself, or a page inside one that exists. */
export function ProjectNotFound() {
  const params = useParams<{ key: string }>();
  const key = parseProjectKey(params.key ?? '');
  const project = useProject(key);
  const found = project.data;
  const pending = project.isPending && key !== null;
  const home = (
    <Link href="/" className={SECONDARY_LINK}>
      Go home
    </Link>
  );

  return (
    <FullPageState
      className="pt-12"
      eyebrow="404"
      title="This page does not exist"
      actions={
        found ? (
          <>
            <Button asChild>
              <Link href={`/projects/${found.key}` as Route}>Back to {found.name}</Link>
            </Button>
            {home}
          </>
        ) : pending ? (
          <Skeleton className="h-control w-40" />
        ) : (
          <>
            <Button asChild>
              <Link href="/projects">All projects</Link>
            </Button>
            {home}
          </>
        )
      }
    >
      {pending ? (
        <span className="flex flex-col gap-2 py-1">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </span>
      ) : found ? (
        `Nothing in ${found.name} lives at this address. It may be mistyped, or come from an older link.`
      ) : (
        <>
          There is no project <span className="font-mono text-text">{key ?? params.key}</span> that you can open. The
          key may be mistyped, or you have not been added to the project.
        </>
      )}
    </FullPageState>
  );
}
