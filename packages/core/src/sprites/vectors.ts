/**
 * Built-in vector sprites.
 *
 * A middle tier between "lettered glyph" and "remote NES art": shapes simple
 * enough to draw in code. A Triforce piece is three triangles; a rupee is a
 * hexagon. Drawing them costs a few hundred bytes, needs no third-party host,
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

/** One Triforce wedge, plus the assembled trio for the summary readout. */
const TRIANGLE = 'M8 2 L14.5 13.5 L1.5 13.5 Z';

export const VECTORS: Readonly<Record<string, VectorSprite>> = {
  'ui.triforce': V(
    `<path d="${TRIANGLE}" fill="#f4c542" stroke="#7a5a10" stroke-width="1" stroke-linejoin="round"/>`,
  ),

  // The full Triforce: three wedges around a hollow centre.
  'ui.triforce.full': V(
    `<g fill="#f4c542" stroke="#7a5a10" stroke-width=".8" stroke-linejoin="round">
       <path d="M8 1 L11.4 7 L4.6 7 Z"/>
       <path d="M4.4 7.6 L7.8 13.6 L1 13.6 Z"/>
       <path d="M11.6 7.6 L15 13.6 L8.2 13.6 Z"/>
     </g>`,
  ),

  'ui.map': V(
    `<path d="M1.5 3.5 L5.8 2 L10.2 4 L14.5 2.5 L14.5 12.5 L10.2 14 L5.8 12 L1.5 13.5 Z"
        fill="#d8cba4" stroke="#6b5c38" stroke-width="1" stroke-linejoin="round"/>
     <path d="M5.8 2 L5.8 12 M10.2 4 L10.2 14" stroke="#6b5c38" stroke-width=".8" fill="none"/>`,
  ),

  'ui.compass': V(
    `<circle cx="8" cy="8" r="6.2" fill="#3f6fa8" stroke="#1d3a5c" stroke-width="1"/>
     <path d="M8 3.4 L9.8 8 L8 12.6 L6.2 8 Z" fill="#f0f0f0"/>
     <circle cx="8" cy="8" r="1" fill="#1d3a5c"/>`,
  ),

  // Ganon reads best as his trident.
  'ui.ganon': V(
    `<g fill="none" stroke="#c34a4a" stroke-width="1.6" stroke-linecap="round">
       <path d="M3.2 2.5 L3.2 6.2 M8 2 L8 6.2 M12.8 2.5 L12.8 6.2"/>
       <path d="M3.2 6.2 L12.8 6.2"/>
       <path d="M8 6.2 L8 14"/>
     </g>`,
  ),

  'item.heart': V(
    `<path d="M8 14 C2.5 10 1 7.6 1 5.6 C1 3.4 2.6 2 4.4 2 C6 2 7.3 3 8 4.3 C8.7 3 10 2 11.6 2
              C13.4 2 15 3.4 15 5.6 C15 7.6 13.5 10 8 14 Z"
        fill="#e0405c" stroke="#7d1524" stroke-width="1" stroke-linejoin="round"/>`,
  ),

  'item.rupee': V(
    `<path d="M8 1.5 L12.5 5.5 L8 14.5 L3.5 5.5 Z"
        fill="#d9a441" stroke="#6d4d10" stroke-width="1" stroke-linejoin="round"/>
     <path d="M8 1.5 L8 14.5 M3.5 5.5 L12.5 5.5" stroke="#6d4d10" stroke-width=".7" fill="none"/>`,
  ),

  'item.bomb': V(
    `<circle cx="7.5" cy="10" r="5" fill="#2f3550" stroke="#12151f" stroke-width="1"/>
     <path d="M10.6 5.6 L12.6 3.2" stroke="#8a6a3a" stroke-width="1.6" stroke-linecap="round" fill="none"/>
     <circle cx="13.2" cy="2.6" r="1.4" fill="#e8813a"/>`,
  ),

  'item.key': V(
    `<circle cx="5" cy="5" r="3.2" fill="none" stroke="#d9b64a" stroke-width="1.8"/>
     <path d="M7.2 7.2 L13.5 13.5 M11 13 L13 11 M12.4 14.4 L14.4 12.4"
        stroke="#d9b64a" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  ),

  'item.key.magical': V(
    `<circle cx="5" cy="5" r="3.2" fill="none" stroke="#c9a2e0" stroke-width="1.8"/>
     <path d="M7.2 7.2 L13.5 13.5 M11 13 L13 11 M12.4 14.4 L14.4 12.4"
        stroke="#c9a2e0" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  ),

  /* --------------------------------------------------------- overworld marks */

  'mark.dungeon': V(
    `<path d="M2.5 14 L2.5 7 A5.5 5.5 0 0 1 13.5 7 L13.5 14 Z"
        fill="#c34a4a" stroke="#5e1d1d" stroke-width="1" stroke-linejoin="round"/>
     <rect x="6.5" y="9" width="3" height="5" fill="#2a1010"/>`,
  ),

  'mark.shop': V(
    `<path d="M2 6 L4 2.5 L12 2.5 L14 6 Z" fill="#3f8fd0" stroke="#1d3a5c" stroke-width="1" stroke-linejoin="round"/>
     <rect x="2.8" y="6" width="10.4" height="7.5" fill="#dfe7ee" stroke="#1d3a5c" stroke-width="1"/>
     <rect x="6.4" y="8.6" width="3.2" height="4.9" fill="#3f8fd0"/>`,
  ),

  'mark.heart': V(
    `<path d="M8 13.6 C3.2 10 2 7.9 2 6.2 C2 4.3 3.4 3.1 4.9 3.1 C6.3 3.1 7.4 4 8 5.1
              C8.6 4 9.7 3.1 11.1 3.1 C12.6 3.1 14 4.3 14 6.2 C14 7.9 12.8 10 8 13.6 Z"
        fill="#e05c7a" stroke="#7d1524" stroke-width="1" stroke-linejoin="round"/>`,
  ),

  'mark.item': V(
    `<path d="M8 1.5 L9.9 6.1 L14.8 6.4 L11 9.5 L12.2 14.3 L8 11.6 L3.8 14.3 L5 9.5 L1.2 6.4 L6.1 6.1 Z"
        fill="#d9a441" stroke="#6d4d10" stroke-width="1" stroke-linejoin="round"/>`,
  ),

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

  'mark.empty': V(
    `<path d="M4 8 L12 8" stroke="#5a5a5a" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  ),

};

export function hasVector(key: string): boolean {
  return Object.hasOwn(VECTORS, key);
}
