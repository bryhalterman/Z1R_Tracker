import { useLayoutEffect, useRef } from 'react';
import type { SpriteResolver } from '@z1r/core';
import { createSprite } from '../sprite.js';

/**
 * A tracker sprite inside React: the same `createSprite` element the rest of
 * the tracker draws, so art, glyph fallbacks and the manifest behave the same.
 * Labelled empty — it always sits inside a control that names it.
 */
export function Sprite({ resolver, spriteKey, size }: { resolver: SpriteResolver; spriteKey: string; size: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    ref.current?.replaceChildren(createSprite(resolver, spriteKey, { size, label: '' }));
  }, [resolver, spriteKey, size]);
  return <span ref={ref} className="inline-flex" />;
}
