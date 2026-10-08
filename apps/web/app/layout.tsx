import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@components/providers';
import { SiteScripts } from '@components/site-scripts';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://work.nothingleft.dev'),
  title: { default: 'Nothing Left', template: '%s · Nothing Left' },
  description: 'An MCP-first project management tool.',
  // Only the public sign-in and sign-up pages opt into indexing.
  robots: { index: false, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <SiteScripts />
      </body>
    </html>
  );
}
