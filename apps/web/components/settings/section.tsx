import type { ReactNode } from 'react';

export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-b pb-5 last:border-b-0">
      <header className="flex items-start gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-medium">{title}</h2>
          {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
