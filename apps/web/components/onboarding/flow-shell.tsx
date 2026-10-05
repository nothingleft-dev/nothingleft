'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark, Wordmark } from '@components/shell/brand';
import { StepRail, type FlowStep } from '@components/onboarding/step-rail';
import { useSignOut } from '@hooks/use-sign-out';

interface FlowShellProps {
  steps: readonly FlowStep[];
  current: number;
  /** Shown top-right once there is an account; omitted while the flow is still anonymous. */
  email?: string | null;
  intro: string;
  children: ReactNode;
}

export function FlowShell({ steps, current, email, intro, children }: FlowShellProps) {
  const signOut = useSignOut();
  const step = steps[current];

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex h-16 flex-none items-center justify-between border-b px-8 max-lg:h-topbar max-lg:px-page-x-mobile">
        <Link href="/" className="flex items-center gap-2" title="Nothing Left" aria-label="Nothing Left">
          <BrandMark size={22} />
          <Wordmark />
        </Link>
        {email ? (
          <div className="flex items-center gap-5 text-sm text-text-secondary">
            <span className="max-sm:hidden">
              Signed in as <span className="font-medium text-text">{email}</span>
            </span>
            <button
              type="button"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
              className="font-medium text-text-secondary underline-offset-4 hover:text-text hover:underline"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-[1120px] flex-1 items-start gap-12 px-6 py-10 max-lg:flex-col max-lg:gap-0 max-lg:p-0">
        {/* An inset block on the page itself, not a floating card inside another card:
            one edge, not three. */}
        <aside className="w-[300px] flex-none rounded-lg bg-app p-8 max-lg:hidden" aria-label="Setup steps">
          <p className="mb-9 text-sm leading-[22px] text-text-secondary">{intro}</p>
          <StepRail steps={steps} current={current} />
        </aside>

        {/* Below lg the rail is one line: four paragraphs above a form is something to
            scroll past, not a map. */}
        <div className="flex w-full items-center gap-2 border-b bg-app px-page-x-mobile py-3 lg:hidden">
          <span className="text-sm font-medium text-text">{step?.title}</span>
          <span className="text-sm text-text-muted">·</span>
          <span className="text-sm text-text-secondary">
            step {current + 1} of {steps.length}
          </span>
        </div>

        <main className="comfortable-form w-full min-w-0 flex-1 py-4 max-lg:px-page-x-mobile max-lg:py-6">
          <div className="max-w-[560px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
