import { Skeleton } from '@components/ui/skeleton';

// Also the Suspense boundary the onboarding flow's useSearchParams() needs to prerender.
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-6" role="status" aria-label="Loading">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-control-lg w-full" />
      <Skeleton className="h-control-lg w-full" />
    </div>
  );
}
