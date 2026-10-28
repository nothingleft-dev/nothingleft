// Satori takes a React-shaped element tree; these helpers build one without JSX.
export type Style = Record<string, string | number>;

export interface OgNode {
  type: string;
  props: { style?: Style; children?: OgChild | OgChild[]; src?: string; width?: number; height?: number };
}
export type OgChild = OgNode | string | false | null | undefined;

export const el = (type: string, style: Style, ...children: OgChild[]): OgNode => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});

// Satori lays out every element with more than one child as a flex container, so say so.
export const box = (style: Style, ...children: OgChild[]) => el('div', { display: 'flex', ...style }, ...children);
export const row = (style: Style, ...children: OgChild[]) =>
  box({ flexDirection: 'row', alignItems: 'center', ...style }, ...children);
export const col = (style: Style, ...children: OgChild[]) => box({ flexDirection: 'column', ...style }, ...children);
export const text = (style: Style, content: string) => el('div', { display: 'flex', ...style }, content);

export const svgImage = (svg: string, width: number, height: number): OgNode => ({
  type: 'img',
  props: { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, width, height },
});
