import type { ReactNode } from 'react';
import { PageTitle } from '@components/page-title';

interface PageHeaderProps {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, meta, actions }: PageHeaderProps) {
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2">
      <PageTitle>{title}</PageTitle>
      {meta ? <span className="text-text-muted">{meta}</span> : null}
      {actions ? <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">{actions}</div> : null}
    </div>
  );
}
