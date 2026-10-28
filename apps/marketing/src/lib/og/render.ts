import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { OG_CARDS } from '@data/og-cards';
import { ogFonts } from './fonts';
import { OG_HEIGHT, OG_WIDTH, ogCardTree } from './templates';

export async function renderOgCard(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const card = OG_CARDS[path];
  if (!card) throw new Error(`${path} has no entry in src/data/og-cards.ts`);
  // Satori's type is React.ReactNode; the tree is the same shape without React.
  const svg = await satori(ogCardTree(path, card) as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  return png as Uint8Array<ArrayBuffer>;
}
