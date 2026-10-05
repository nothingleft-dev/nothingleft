import type { Metadata } from 'next';
import { AllArticles } from '@components/articles/all-articles';

export const metadata: Metadata = { title: 'Knowledge base' };

export default function Page() {
  return <AllArticles />;
}
