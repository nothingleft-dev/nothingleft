import type { Metadata } from 'next';
import { TransferFlow } from '@components/transfer/transfer-flow';

export const metadata: Metadata = { title: 'Ownership transfer' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TransferFlow token={token} />;
}
