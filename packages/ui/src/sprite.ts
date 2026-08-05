/**
 * Sprite element factory.
 *
 * Deliberately synchronous: it returns an element immediately in whatever form
 * the manifest allows, then degrades it once the network answers. A tracker
 * that stalls waiting on a third-party image host is worse than one showing a
 * drawn shape.
 */

import type { ResolvedSprite, SpriteResolver } from '@z1r/core';

export interface SpriteOptions {
  /** Rendered edge length in CSS pixels. */
  readonly size?: number;
  readonly className?: string;
  /** Overrides the manifest name used for the tooltip / accessible label. */
  readonly label?: string;
}

/** Paints one resolution into `element`, replacing whatever was there. */
function paint(element: HTMLElement, resolved: ResolvedSprite, size: number): void {
  element.style.backgroundImage = '';
  element.style.backgroundPosition = '';
  element.textContent = '';

  switch (resolved.kind) {
    case 'glyph':
      element.dataset.spriteMode = 'glyph';
      element.textContent = resolved.text;
      return;

    case 'svg': {
      element.dataset.spriteMode = 'svg';
      // Built from a trusted in-repo table, never from manifest or user input,
      // so the markup is safe to inject. Keep it that way.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', resolved.vector.viewBox);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = resolved.vector.markup;
      element.replaceChildren(svg);
      return;
    }

    case 'image':
      element.dataset.spriteMode = 'image';
      element.style.backgroundImage = `url("${resolved.url}")`;
      return;

    case 'sheet': {
      const [x, y, width, height] = resolved.rect;
      const scale = size / Math.max(width, height);
      element.dataset.spriteMode = 'sheet';
      element.style.backgroundImage = `url("${resolved.url}")`;
      element.style.backgroundPosition = `${-x * scale}px ${-y * scale}px`;
      element.style.backgroundSize = 'auto';
      element.style.setProperty('--sheet-scale', String(scale));
      return;
    }
  }
}

export function createSprite(
  resolver: SpriteResolver,
  key: string,
  options: SpriteOptions = {},
): HTMLElement {
  const { size = 32, className, label } = options;
  const element = document.createElement('span');
  element.className = className ? `z1r-sprite ${className}` : 'z1r-sprite';
  element.style.setProperty('--sprite-size', `${size}px`);

  const resolved = resolver.resolve(key);
  element.title = label ?? resolved.name;
  // Decorative. When a sprite sits inside a button, the button's own label must
  // win — otherwise screen readers announce the art and drop the state.
  element.setAttribute('aria-hidden', 'true');
  element.dataset.spriteKey = key;

  paint(element, resolved, size);

  if (resolved.kind === 'image' || resolved.kind === 'sheet') {
    // A dead host, a blocked hotlink, or being offline all land here. Degrade
    // to the drawn vector when the key has one, and only then to letters.
    void resolver.preload(key).then((ok) => {
      if (!ok) paint(element, resolver.fallback(key), size);
    });
  }

  return element;
}
