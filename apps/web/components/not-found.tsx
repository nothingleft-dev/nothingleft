import Link from 'next/link';
import { Button } from '@components/ui/button';
import { cn } from '@lib/utils';

// Denied and missing render identically (docs/permissions.md, rule 4).
export function NotFound({ className }: { className?: string }) {
  return (
    <div className={cn('flex max-w-md flex-col items-start gap-3', className)}>
      <p className="font-mono text-2xs text-text-muted">404</p>
      <h1 className="text-xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="text-text-secondary">
        The address may be wrong, or it points at something you do not have access to. Your data is unaffected.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
