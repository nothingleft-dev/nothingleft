import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { OG_HEIGHT, OG_WIDTH, ogFonts } from '@nothingleft/brand/og';
import { AUTH_PAGES, isAuthPage } from '@lib/auth-metadata';
import { authCard } from '@lib/og/auth-card';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(AUTH_PAGES).map(page => ({ card: `${page}.png` }));
}

const fonts = ogFonts(join(process.cwd(), 'node_modules/@nothingleft/brand/fonts'));

export async function GET(_request: Request, { params }: { params: Promise<{ card: string }> }) {
  const page = (await params).card.replace(/\.png$/, '');
  if (!isAuthPage(page)) notFound();
  // ImageResponse types its element as React's, and Satori reads the same {type, props} shape.
  return new ImageResponse(authCard(AUTH_PAGES[page].card) as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
}
