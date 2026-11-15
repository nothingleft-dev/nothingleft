import Link from 'next/link';
import { Button } from '@components/ui/button';
import { FullPageState } from '@components/full-page-state';

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
      The address may be wrong, or it points at something you do not have access to. Your data is unaffected.
    </FullPageState>
  );
}
