import { BrandMark } from '@components/shell/brand';

/**
 * Only for the moments nothing on screen is known yet: shell boot while the session is
 * resolved. Everything inside a known layout uses skeletons instead.
 */
export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-dvh place-items-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <BrandMark size={40} animated />
        {/* Named only once the wait is long enough to wonder about; a quick boot shows the mark alone. */}
        <span className="text-xs text-text-secondary animate-in fade-in [animation-delay:1s] [animation-duration:200ms] [animation-fill-mode:both] motion-reduce:animate-none">
          {label}
        </span>
      </div>
    </div>
  );
}
