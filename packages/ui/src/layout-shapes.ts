/**
 * A room layout as shapes: one per square, in the 12x7 grid's own units.
 *
 * Shared by the sheet's cells and the room card, both through `LayoutArt`,
 * so the two can never draw the same layout differently. Each kind of
 * square is its own shape as well as its own fill — a block is a solid
 * square, a statue a ring, water a filled square with a line through it, sand
 * a dot, stairs two rungs — so the picture still reads with the colour taken
 * away.
 */

import type { RoomLayoutDef } from '@z1r/core';

export interface LayoutShape {
  readonly tag: 'rect' | 'ellipse';
  /** Becomes the `z1r-layout-<kind>` class the stylesheet fills by. */
  readonly kind: 'block' | 'statue' | 'stairs' | 'water' | 'wave' | 'sand' | 'black';
  readonly attrs: Readonly<Record<string, number>>;
}

export function layoutShapes(def: RoomLayoutDef): LayoutShape[] {
  const shapes: LayoutShape[] = [];
  def.rows.forEach((row, y) => {
    [...row].forEach((square, x) => {
      const full = { x, y, width: 1, height: 1 };
      switch (square) {
        case '#':
          shapes.push({
            tag: 'rect',
            kind: 'block',
            attrs: { x: x + 0.06, y: y + 0.06, width: 0.88, height: 0.88 },
          });
          break;
        case 'o':
          shapes.push({
            tag: 'ellipse',
            kind: 'statue',
            attrs: { cx: x + 0.5, cy: y + 0.5, rx: 0.3, ry: 0.3 },
          });
          break;
        case '=':
          shapes.push({
            tag: 'rect',
            kind: 'stairs',
            attrs: { x: x + 0.15, y: y + 0.2, width: 0.7, height: 0.15 },
          });
          shapes.push({
            tag: 'rect',
            kind: 'stairs',
            attrs: { x: x + 0.15, y: y + 0.65, width: 0.7, height: 0.15 },
          });
          break;
        case '~':
          shapes.push({ tag: 'rect', kind: 'water', attrs: full });
          shapes.push({ tag: 'rect', kind: 'wave', attrs: { x, y: y + 0.45, width: 1, height: 0.1 } });
          break;
        case ':':
          shapes.push({
            tag: 'ellipse',
            kind: 'sand',
            attrs: { cx: x + 0.5, cy: y + 0.5, rx: 0.14, ry: 0.14 },
          });
          break;
        case 'x':
          shapes.push({ tag: 'rect', kind: 'black', attrs: full });
          break;
      }
    });
  });
  return shapes;
}
