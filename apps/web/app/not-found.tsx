import Link from 'next/link';
import { Button } from '@components/ui/button';

// Denied and missing render identically (docs/permissions.md, rule 4).
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-app px-page-x-mobile">
      <div className="flex max-w-sm flex-col items-start gap-3">
        <p className="font-mono text-2xs text-text-muted">404</p>
        <h1 className="text-xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="text-text-secondary">
          The address may be wrong, or it points at something you do not have access to. Your data is unaffected.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
