import { BrandMark } from '@components/shell/brand';

/**
 * Only for the moments nothing on screen is known yet: shell boot while the session is
 * resolved. Everything inside a known layout uses skeletons instead.
 */
export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-dvh place-items-center bg-app">
      <div className="flex flex-col items-center gap-4">
        <BrandMark size={40} animated />
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}
