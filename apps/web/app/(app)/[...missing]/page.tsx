import { notFound } from 'next/navigation';

// An unknown address while signed in gets the 404 inside the shell, not the bare root one.
export default function UnknownAddress() {
  notFound();
}
