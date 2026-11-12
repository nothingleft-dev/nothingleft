import { NotFound } from '@components/not-found';

export default function RootNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-app px-page-x-mobile">
      <NotFound className="max-w-sm" />
    </main>
  );
}
