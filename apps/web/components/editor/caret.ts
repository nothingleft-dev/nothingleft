const MIRRORED = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'tabSize',
  'whiteSpace',
  'wordWrap',
] as const;

/** Viewport rectangle of a caret offset inside a textarea, measured with an off-screen mirror. */
export function textareaCaretRect(textarea: HTMLTextAreaElement, offset: number): DOMRect {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const prop of MIRRORED) mirror.style[prop] = style[prop];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.textContent = textarea.value.slice(0, offset);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const box = textarea.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const rect = new DOMRect(
    box.left + marker.offsetLeft - textarea.scrollLeft,
    box.top + marker.offsetTop - textarea.scrollTop,
    1,
    lineHeight,
  );
  mirror.remove();
  return rect;
}
