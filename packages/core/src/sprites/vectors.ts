/**
 * Built-in vector sprites.
 *
 * A middle tier between "lettered glyph" and "remote NES art": shapes simple
 * enough to draw in code. A Triforce piece is three triangles; a bomb is a
 * circle with a fuse. Drawing them costs a few hundred bytes, needs no host,
 * survives being offline, and carries no attribution burden — so the tracker
 * looks finished out of the box.
 *
 * A manifest entry with a `url` or `sheet` always wins, so supplying real art
 * later overrides these without touching this file.
 *
 * Shapes are authored on a 16x16 grid to match NES sprite proportions.
 */

export interface VectorSprite {
  readonly viewBox: string;
  /** SVG child markup. No <svg> wrapper — the renderer supplies it. */
  readonly markup: string;
}

const V = (markup: string): VectorSprite => ({ viewBox: '0 0 16 16', markup });

/** A line icon on a 24px grid: light strokes, no fill, one weight for the set. */
const LINE = (markup: string): VectorSprite => ({
  viewBox: '0 0 24 24',
  markup: `<g fill="none" stroke="#f2f2f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${markup}</g>`,
});

/** One Triforce wedge — the per-dungeon toggle. */
const TRIANGLE = 'M8 2 L14.5 13.5 L1.5 13.5 Z';

export const VECTORS: Readonly<Record<string, VectorSprite>> = {
  'ui.triforce': V(
    `<path d="${TRIANGLE}" fill="#f4c542" stroke="#7a5a10" stroke-width="1" stroke-linejoin="round"/>`,
  ),

  'item.heart': V(
    `<path d="M8 14 C2.5 10 1 7.6 1 5.6 C1 3.4 2.6 2 4.4 2 C6 2 7.3 3 8 4.3 C8.7 3 10 2 11.6 2
              C13.4 2 15 3.4 15 5.6 C15 7.6 13.5 10 8 14 Z"
        fill="#e0405c" stroke="#7d1524" stroke-width="1" stroke-linejoin="round"/>`,
  ),

  'item.bomb': V(
    `<circle cx="7.5" cy="10" r="5" fill="#2f3550" stroke="#12151f" stroke-width="1"/>
     <path d="M10.6 5.6 L12.6 3.2" stroke="#8a6a3a" stroke-width="1.6" stroke-linecap="round" fill="none"/>
     <circle cx="13.2" cy="2.6" r="1.4" fill="#e8813a"/>`,
  ),

  'item.key.magical': V(
    `<circle cx="5" cy="5" r="3.2" fill="none" stroke="#c9a2e0" stroke-width="1.8"/>
     <path d="M7.2 7.2 L13.5 13.5 M11 13 L13 11 M12.4 14.4 L14.4 12.4"
        stroke="#c9a2e0" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  ),

  /*
   * A staircase, for the places a staircase means stairs: a dungeon room's
   * item basement and the stair slots in Locations. The overworld warp mark
   * used to share it, and now draws a line icon with the other marks.
   */
  'ui.stairs': V(
    `<path d="M1 1.8 L5.67 1.8 L5.67 6.26 L10.34 6.26 L10.34 10.71 L15 10.71 L15 14.8 L1 14.8 Z"
        fill="#2fb0a6" stroke="#0f4a45" stroke-width="1.2" stroke-linejoin="round"/>
     <path d="M5.67 6.26 L5.67 14.8 M10.34 10.71 L10.34 14.8" stroke="#0f4a45" stroke-width="1.2"
        stroke-linecap="round" fill="none"/>`,
  ),

  /* --------------------------------------------------------- overworld marks */

  'mark.heart': V(
    `<path d="M8 13.6 C3.2 10 2 7.9 2 6.2 C2 4.3 3.4 3.1 4.9 3.1 C6.3 3.1 7.4 4 8 5.1
              C8.6 4 9.7 3.1 11.1 3.1 C12.6 3.1 14 4.3 14 6.2 C14 7.9 12.8 10 8 13.6 Z"
        fill="#e05c7a" stroke="#7d1524" stroke-width="1" stroke-linejoin="round"/>`,
  ),


  /*
   * The money-making game. A rupee, because that is what the room is.
   *
   * Drawn as the NES rupee's flattened hexagon rather than a coin, so it does
   * not read as the shop's awning at a glance — the two are next to each other
   * in the toolbar and both are "a cave that wants your money".
   */

  /*
   * The old man with something to tell you. A speech bubble rather than a
   * figure: at 18px a person is an indistinct blob, whereas a bubble with a
   * tail reads immediately and says "there are words here".
   */

  /*
   * A warp staircase. Three descending steps, drawn as one silhouette.
   *
   * The stepped edge is the point: every other mark in the toolbar is a
   * symmetric blob — an arch, an awning, a star, a hexagon, a bubble — so a
   * shape that falls left to right is the one thing in the row that cannot be
   * mistaken for its neighbours at 18px. The riser lines keep the steps apart
   * once it is small enough for the notches to close up.
   */

  'mark.bombable': V(
    `<circle cx="7.5" cy="10" r="4.6" fill="#8e8e8e" stroke="#3d3d3d" stroke-width="1"/>
     <path d="M10.4 6 L12.4 3.6" stroke="#6b5432" stroke-width="1.5" stroke-linecap="round" fill="none"/>
     <circle cx="13" cy="3" r="1.3" fill="#e8813a"/>`,
  ),

  'mark.burnable': V(
    `<path d="M8 1.5 C10.4 5 12.8 6.6 12.8 9.6 A4.8 4.8 0 0 1 3.2 9.6 C3.2 7.2 4.6 6.4 5.6 4.8
              C6.2 6.4 7 6.8 7.4 6.2 C7.9 5.4 7.4 3.6 8 1.5 Z"
        fill="#e2762f" stroke="#7a3608" stroke-width="1" stroke-linejoin="round"/>`,
  ),

  'mark.pushable': V(
    `<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1"
        fill="#7a6a52" stroke="#3b3125" stroke-width="1"/>
     <path d="M2.2 8 L13.8 8 M8 2.2 L8 13.8" stroke="#3b3125" stroke-width=".9" fill="none"/>`,
  ),

  'mark.warp': V(
    `<path d="M8 8 m0 -5.6 a5.6 5.6 0 1 1 -3.9 9.6 a4 4 0 1 1 6.6 -4.4 a2.5 2.5 0 1 0 -3.9 2.8"
        fill="none" stroke="#8f5cc4" stroke-width="1.7" stroke-linecap="round"/>`,
  ),

  /*
   * Overworld marks: one line-icon family, so the brush row and the map read as
   * a set. Light strokes on a 24px grid; the colour each mark carries is its
   * tint, drawn behind the icon by the brush tile and the map's disc from
   * `MARKS[].color`, never inside the shape — so the shape alone names it.
   *
   * Paths from Lucide (lucide.dev), used under its ISC License:
   *
   * Copyright (c) 2026 Lucide Icons and Contributors
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   */
  // Clearing screens: an eraser.
  'mark.clear': LINE(`<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/>`),
  'mark.dungeon': LINE(`<path d="M10 5V3"/><path d="M14 5V3"/><path d="M15 21v-3a3 3 0 0 0-6 0v3"/><path d="M18 3v8"/><path d="M18 5H6"/><path d="M22 11H2"/><path d="M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9"/><path d="M6 3v8"/>`),
  'mark.shop': LINE(`<path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/>`),
  'mark.item': LINE(`<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>`),
  'mark.gamble': LINE(`<rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>`),
  'mark.hintroom': LINE(`<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/>`),
  'mark.doorRepair': LINE(`<path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>`),
  'mark.rupeeSecret': LINE(`<path d="M10.5 3 8 9l4 13 4-13-2.5-6"/><path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z"/><path d="M2 9h20"/>`),
  // Lucide has no staircase, so this one is drawn for the set: a flight of
  // stairs in the same stroke on the same grid, which says "warp staircase"
  // the way the dungeon sheet's stairs do, rather than an abstract network.
  'mark.stairway': LINE(`<path d="M3 21h5v-5h5v-5h5V6h3"/>`),
  // "Checked, nothing": looked at and done with.
  'mark.empty': LINE(`<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>`),
  // The start pennant keeps a fill: it is drawn in a corner over bare terrain,
  // without the disc the other marks sit on.
  'mark.start': LINE(`<path fill="#da9f00" d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>`),
};
