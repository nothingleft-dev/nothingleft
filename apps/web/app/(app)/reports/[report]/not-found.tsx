import Link from 'next/link';
import { Button } from '@components/ui/button';
import { FullPageState } from '@components/full-page-state';

export default function UnknownReport() {
  return (
    <FullPageState
      className="pt-12"
      eyebrow="404"
      title="There is no report by that name"
      actions={
        <Button asChild>
          <Link href="/reports">All reports</Link>
        </Button>
      }
    >
      The address may be mistyped or come from an older link. Every report is listed on the reports page.
    </FullPageState>
  );
}
