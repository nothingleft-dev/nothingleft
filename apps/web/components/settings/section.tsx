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
      <header className="flex items-start gap-4 max-sm:flex-col max-sm:gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-semibold">{title}</h2>
          {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
        </div>
        {actions ? (
          // On a phone the description keeps the width and the actions drop under it.
          <div className="ml-auto flex shrink-0 items-center gap-2 max-sm:ml-0 max-sm:flex-wrap">{actions}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}
