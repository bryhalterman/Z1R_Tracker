/**
 * Sprite element factory.
 *
 * Deliberately synchronous: it returns an element immediately in whatever
 * form the manifest allows, then upgrades or downgrades it once the network
 * answers. A tracker that stalls waiting on a third-party image host is worse
 * than one showing letters.
 */

import type { SpriteResolver } from '@z1r/core';

export interface SpriteOptions {
  /** Rendered edge length in CSS pixels. */
  readonly size?: number;
  readonly className?: string;
  /** Overrides the manifest name used for the tooltip / accessible label. */
  readonly label?: string;
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
  element.setAttribute('aria-label', label ?? resolved.name);
  element.dataset.spriteKey = key;

  const drawGlyph = (text: string) => {
    element.dataset.spriteMode = 'glyph';
    element.style.backgroundImage = '';
    element.textContent = text;
  };

  switch (resolved.kind) {
    case 'glyph':
      drawGlyph(resolved.text);
      break;

    case 'image':
      element.dataset.spriteMode = 'image';
      element.style.backgroundImage = `url("${resolved.url}")`;
      // Fall back to a glyph if the remote host 404s or blocks hotlinking.
      void resolver.preload(key).then((ok) => {
        if (!ok) drawGlyph(resolver.entry(key)?.glyph ?? '?');
      });
      break;

    case 'sheet': {
      const [x, y, width, height] = resolved.rect;
      const scale = size / Math.max(width, height);
      element.dataset.spriteMode = 'sheet';
      element.style.backgroundImage = `url("${resolved.url}")`;
      element.style.backgroundPosition = `${-x * scale}px ${-y * scale}px`;
      element.style.backgroundSize = 'auto';
      element.style.setProperty('--sheet-scale', String(scale));
      void resolver.preload(key).then((ok) => {
        if (!ok) drawGlyph(resolver.entry(key)?.glyph ?? '?');
      });
      break;
    }
  }

  return element;
}
