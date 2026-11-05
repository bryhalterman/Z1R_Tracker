import { useLayoutEffect, useRef } from 'react';
import type { SpriteResolver } from '@z1r/core';
import { applySprite, createSprite } from '../sprite.js';

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

/**
 * The sprite element itself, rendered by React rather than wrapped by it.
 *
 * The map cells' stylesheet places art with `> .z1r-sprite` and hides empty
 * slots with `:empty`, so the art has to be the slot's direct child. This
 * renders that span and paints it with the same `applySprite` the plain-DOM
 * `createSprite` uses. No title: it always sits inside a control whose own
 * tooltip and label name it.
 */
export function SpriteArt({
  resolver,
  spriteKey,
  size,
  className,
}: {
  resolver: SpriteResolver;
  spriteKey: string;
  size: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (ref.current) applySprite(ref.current, resolver, spriteKey, size);
  }, [resolver, spriteKey, size]);
  return (
    <span
      ref={ref}
      className={className ? `z1r-sprite ${className}` : 'z1r-sprite'}
      style={{ '--sprite-size': `${size}px` } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}
