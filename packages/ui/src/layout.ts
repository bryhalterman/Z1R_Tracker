/**
 * The tracker's measured layout: the width band, the Maps choice, the overlay's
 * balanced item grids and the map's whole-pixel cells, all re-run from one
 * ResizeObserver.
 */

import { OVERWORLD_COLUMNS } from '@z1r/core';
import { mapsLayout } from './maps-layout.js';

export interface LayoutOptions {
  readonly mode: 'full' | 'overlay';
  /** Follow the toolbar's Maps choice — see `MountOptions.mapsLayout`. */
  readonly followMapsLayout: boolean;
}

/**
 * Lay `root` out now and on every resize, returning what undoes it.
 *
 * `main` is the panels' own column when the palette has the left edge, or
 * `null` when the panels fill the root. Started once the panels are built and
 * folded, since it measures them.
 */
export function startLayout(root: HTMLElement, main: HTMLElement | null, options: LayoutOptions): () => void {
  const { mode, followMapsLayout } = options;
  const disposers: (() => void)[] = [];

  /*
   * Publish the tracker's own width as a band.
   *
   * Layout rules key off this rather than a media query, because the OBS
   * overlay lays out at a fixed composition width inside a Browser Source of
   * some other size — so the viewport describes the wrong box entirely.
   */
  const applyWidthBand = () => {
    // The panels' own column when the palette has the left edge: the bands
    // describe the room the panels have, not the page.
    const width = (main ?? root).offsetWidth;
    root.dataset.width = width < 640 ? 'xs' : width < 720 ? 'sm' : 'md';
    applyMapsLayout();
  };

  /*
   * Side by side or stacked, from the toolbar's Maps choice; Auto is the width
   * rule, so it is resolved here, beside the band it reads. The stylesheet
   * only ever sees the answer.
   */
  const applyMapsLayout = () => {
    if (!main || !followMapsLayout) return;
    const choice = mapsLayout.get();
    main.dataset.maps = choice === 'auto' ? (root.dataset.width === 'md' ? 'side' : 'stacked') : choice;
  };
  // The choice is module state shared by every mount, so the watch is undone
  // on teardown rather than left holding this mount's tree.
  if (followMapsLayout) disposers.push(mapsLayout.watch(applyMapsLayout));

  /*
   * Balance each item grid so the last row is never a stray remainder.
   *
   * `repeat(auto-fill, ...)` packs as many columns as fit and lets the
   * remainder fall where it may — ten B-slot items in eight columns render as
   * eight and then a lonely two. Choosing the column count from the row count
   * instead gives five and five, which is also how the game's own inventory
   * reads: one row of always-active items, then the equipable ones below.
   *
   * The cell size stays keyed to the *maximum* columns that fit, not the
   * balanced count, so every group draws at one size. Sprites snap to integer
   * scale factors, so a group with wider cells would land on a different
   * multiple and visibly disagree with its neighbour.
   */
  const balanceItemGrids = () => {
    /*
     * Overlay only. Other mounts have room to let cells stretch to fill, which
     * is what `auto-fill` with a `1fr` track already does well; balancing
     * there would shrink every cell to its minimum and centre the block. The
     * mode is fixed per mount, so those mounts never write a column count.
     */
    if (mode !== 'overlay') return;
    for (const grid of root.querySelectorAll<HTMLElement>('.z1r-item-grid')) {
      const count = grid.childElementCount;
      if (count === 0) continue;

      const styles = getComputedStyle(grid);
      const gap = Number.parseFloat(styles.columnGap) || 0;
      const inner =
        grid.clientWidth -
        (Number.parseFloat(styles.paddingLeft) || 0) -
        (Number.parseFloat(styles.paddingRight) || 0);
      // Mid-teardown, or display:none — leave the stylesheet's rule in place
      // rather than committing a column count derived from a zero width.
      if (inner <= 0) continue;

      const minCell = Number.parseFloat(styles.getPropertyValue('--z1r-item-min')) || 44;
      const maxColumns = Math.max(1, Math.floor((inner + gap) / (minCell + gap)));
      const rows = Math.ceil(count / maxColumns);
      const columns = Math.ceil(count / rows);
      const cell = Math.max(minCell, Math.floor((inner + gap) / maxColumns - gap));

      const next = `repeat(${columns}, ${cell}px)`;
      // Writing unconditionally would re-enter this observer on every pass.
      if (grid.style.gridTemplateColumns !== next) grid.style.gridTemplateColumns = next;
    }
  };

  /*
   * Give the map whole-pixel cells.
   *
   * `1fr` columns share out the remainder, so sixteen of them in a panel that
   * is not a multiple of sixteen produce fractional widths — 54.4px, say. The
   * terrain image is then positioned as a percentage of that and lands on
   * half-pixel boundaries, which the renderer resolves by blending. That is
   * soft however the image is sampled, and it is why the map still looked
   * blurry after switching to nearest-neighbour.
   *
   * Rounding the cell down to a whole number and centring the grid costs at
   * most fifteen pixels of width and puts every screen on an exact boundary.
   */
  const applyMapScale = () => {
    const map = root.querySelector<HTMLElement>('.z1r-map');
    if (!map) return;
    const gap = Number.parseFloat(getComputedStyle(map).columnGap) || 0;
    // `clientWidth` excludes the border and includes padding, which is the box
    // the columns are actually laid out in.
    const inner = map.clientWidth;
    if (inner <= 0) return;

    const cell = Math.floor((inner - gap * (OVERWORLD_COLUMNS - 1)) / OVERWORLD_COLUMNS);
    if (cell < 8) return;
    // Height rounded independently rather than left to `aspect-ratio`, which
    // would reintroduce a fraction on the other axis.
    const height = Math.max(6, Math.round((cell * 11) / 16));

    // Compare before writing, or this re-enters the observer that calls it.
    if (map.style.getPropertyValue('--map-cell') !== `${cell}px`) {
      map.style.setProperty('--map-cell', `${cell}px`);
      map.style.setProperty('--map-cell-height', `${height}px`);
    }
  };

  const applyLayout = () => {
    applyWidthBand();
    balanceItemGrids();
    applyMapScale();
  };

  applyLayout();
  const widthObserver = new ResizeObserver(applyLayout);
  widthObserver.observe(root);
  /*
   * The map too. Side by side and stacked change the map panel's width
   * without changing the root's, so watching the root alone left the cells at
   * their old pixel size until the window itself was resized.
   */
  const map = root.querySelector<HTMLElement>('.z1r-map');
  if (map) widthObserver.observe(map);

  return () => {
    widthObserver.disconnect();
    for (const dispose of disposers) dispose();
  };
}
