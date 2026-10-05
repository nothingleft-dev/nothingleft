import { cookies } from 'next/headers';

// Server components have no ambient cookie; the browser's session cookie is forwarded by hand.
export async function serverHeaders(): Promise<Record<string, string>> {
  const cookie = (await cookies()).toString();
  return cookie ? { cookie } : {};
}
