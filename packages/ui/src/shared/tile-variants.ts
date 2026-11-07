/**
 * The ring and sprite strength the small square tiles draw their state with:
 * the map's brushes and stock tiles, the palette's items, and the location
 * chips.
 *
 * The ring is the shape channel — armed a thicker ring in the accent, on (held,
 * collected, current) a solid ring on a raised fill, off a hairline — and a
 * dimmed sprite, gray and faded, repeats "off" without leaning on color. Each
 * tile adds its own size, corners and cursor.
 *
 * Variants are applied in the order they are declared, and the caller's `cn`
 * keeps the last of any two that clash: so a dashed edge replaces the ring,
 * and armed replaces both.
 */

import { cva } from 'class-variance-authority';

/** A sprite inside the element, faded and gray: what "not held" looks like. */
const SPRITE_DIM = {
  dim: '[&_.z1r-sprite]:opacity-40 [&_.z1r-sprite]:grayscale',
  faint: '[&_.z1r-sprite]:opacity-35 [&_.z1r-sprite]:grayscale',
  /** Full strength again, over a dim the tile would otherwise take. */
  lit: '[&_.z1r-sprite]:opacity-100 [&_.z1r-sprite]:grayscale-0',
} as const;

export type SpriteDim = keyof typeof SPRITE_DIM;

/** The sprite strength alone, for an element that is not itself a tile. */
export function spriteDim(dim: SpriteDim | false | undefined): string {
  return dim ? SPRITE_DIM[dim] : '';
}

export const tileVariants = cva(
  'relative grid place-items-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
  {
    variants: {
      ring: {
        on: 'bg-secondary shadow-[inset_0_0_0_1.5px_var(--foreground)]',
        off: 'shadow-[inset_0_0_0_1px_var(--border)]',
        /** No state to show: a quiet fill and the hairline. */
        quiet: 'bg-secondary/50 shadow-[inset_0_0_0_1px_var(--border)]',
      },
      dim: SPRITE_DIM,
      edge: {
        /** Bought, not found: a dashed edge in place of the ring. */
        dashed: 'shadow-none border border-dashed border-muted-foreground',
      },
      armed: {
        true: 'shadow-[inset_0_0_0_2.5px_var(--primary)]',
      },
    },
  },
);
