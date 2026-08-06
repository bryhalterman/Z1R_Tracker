/**
 * The tracker view.
 *
 * Builds its DOM once and then patches it on every state change. A full
 * re-render would be simpler, but this view runs inside an OBS browser source
 * alongside a game capture — churning hundreds of nodes per click is exactly
 * the kind of thing that shows up as a dropped frame on stream.
 */

import {
  canEnterLevel9,
  safeStorage,
  COAST_ITEM_REQUIRES,
  COAST_SPOT_ID,
  DUNGEONS,
  OVERWORLD_LOCATIONS,
  MARKS,
  MARKS_BY_KIND,
  OVERWORLD_COLUMNS,
  OVERWORLD_ROWS,
  POOL_BY_ID,
  REGIONS_BY_ID,
  regionForScreen,
  SHOP_STOCK,
  SHOP_STOCK_BY_ID,
  SHUFFLE_POOL,
  ITEMS,
  labelFor,
  maxValue,
  screenId,
  spriteFor,
  type ItemDef,
  type MarkKind,
  type SpriteResolver,
  type Store,
  type TrackerState,
} from '@z1r/core';
import { createSprite } from './sprite.js';
import { memoise, runPatches, type Patch } from './patch.js';
import { buildSeedPanel } from './seed-panel.js';
import { buildLocations } from './locations.js';
import { buildHintTracker } from './hints.js';
import { buildTriforce } from './triforce.js';

export type TrackerSection =
  | 'seed'
  | 'items'
  | 'dungeons'
  | 'locations'
  | 'hintlog'
  | 'map';

export interface MountOptions {
  readonly store: Store;
  readonly resolver: SpriteResolver;
  /** `overlay` drops padding and chrome for use as an OBS browser source. */
  readonly mode?: 'full' | 'overlay';
  /** false renders a read-only display — the browser source should not be clickable. */
  readonly interactive?: boolean;
  readonly sections?: readonly TrackerSection[];
  /** Item cell edge length in CSS pixels. */
  readonly itemSize?: number;
  /**
   * Dense layout for narrow contexts — the OBS dock and overlay. Panels that
   * have a compact form use it; the rest are unaffected.
   */
  readonly compact?: boolean;
}

const DEFAULT_SECTIONS: readonly TrackerSection[] = [
  'seed',
  'items',
  'dungeons',
  'locations',
  'hintlog',
  'map',
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Two letters for a cell label.
 *
 * A cell is under 90px and already carries an icon, so anything longer than
 * this wraps or clips. Two letters is enough to tell "RA" from "BO" when you
 * know which handful of items are still missing.
 */
function shortCode(name: string | undefined): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  // Initials for a two-word name — "White Sword" reads better as WS than WH.
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function section(title: string, bodyClass: string): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', 'z1r-panel');
  root.append(el('h2', 'z1r-panel-title', title));
  const body = el('div', bodyClass);
  root.append(body);
  return { root, body };
}

/** Which panels are folded away. A view preference, not run data. */
const COLLAPSE_KEY = 'z1r-tracker:collapsed';

function readCollapsed(): Set<string> {
  try {
    const raw = safeStorage()?.getItem(COLLAPSE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    // Blocked storage, or a hand-edited value. Everything open is a fine
    // fallback — this only decides what is folded, never what is tracked.
    return new Set();
  }
}

/**
 * Let every panel fold away by its heading.
 *
 * Wired here by walking the panels rather than built into each one, so the six
 * existing panels and any later one get it without being touched.
 *
 * Kept out of the tracker state deliberately. State is broadcast to the overlay
 * and written into exported saves, and neither should care which panels someone
 * folded up on the other monitor — this is a property of the window you are
 * looking at, so it lives in its own storage key.
 */
function wireCollapsing(root: HTMLElement): void {
  const collapsed = readCollapsed();

  const persist = () => {
    try {
      safeStorage()?.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Folding still works for this session; it just will not be remembered.
    }
  };

  for (const panel of root.querySelectorAll<HTMLElement>('.z1r-panel')) {
    const title = panel.querySelector<HTMLElement>('.z1r-panel-title');
    if (!title) continue;

    // The heading's own text, before the counters and buttons appended after
    // it. Stable across renames of the CSS classes, and readable in storage.
    const name = title.childNodes[0]?.nodeValue?.trim();
    if (!name) continue;
    panel.dataset.section = name;

    const toggle = el('button', 'z1r-panel-toggle');
    toggle.type = 'button';
    const setState = (folded: boolean) => {
      panel.dataset.collapsed = String(folded);
      toggle.setAttribute('aria-expanded', String(!folded));
      // Both a glyph and a label, so the state is not carried by rotation alone.
      toggle.textContent = folded ? '▸' : '▾';
      toggle.title = folded ? `Show ${name}` : `Hide ${name}`;
      toggle.setAttribute('aria-label', toggle.title);
    };

    const flip = () => {
      const folded = panel.dataset.collapsed !== 'true';
      if (folded) collapsed.add(name);
      else collapsed.delete(name);
      setState(folded);
      persist();
    };

    toggle.addEventListener('click', flip);
    title.prepend(toggle);

    /*
     * The whole heading is a hit target, not just the caret — a caret alone is
     * a fiddly thing to hit mid-run. Clicks that land on a control inside the
     * heading are left alone, though: several headings carry buttons and
     * counters of their own, and folding the panel out from under one would be
     * a nasty surprise.
     */
    title.addEventListener('click', (event) => {
      const control = (event.target as HTMLElement | null)?.closest('button, select, input, label, a');
      // The caret has its own handler, and anything else in the heading is
      // there to be clicked on its own terms.
      if (control) return;
      flip();
    });

    setState(collapsed.has(name));
  }
}

export function mountTracker(root: HTMLElement, options: MountOptions): () => void {
  const {
    store,
    resolver,
    mode = 'full',
    interactive = true,
    sections = DEFAULT_SECTIONS,
    itemSize = 40,
    compact = false,
  } = options;

  // Spectrum scopes its tokens to these classes, so the mount root carries them
  // rather than requiring each app's HTML to opt in. `medium` is the desktop
  // scale; `large` is for touch and would inflate every control.
  root.classList.add('z1r-tracker', 'spectrum', 'spectrum--dark', 'spectrum--medium');
  root.dataset.mode = mode;
  root.dataset.compact = String(compact);
  root.dataset.interactive = String(interactive);
  root.replaceChildren();

  const patches: Patch[] = [];
  const builders: Record<TrackerSection, () => HTMLElement> = {
    seed: () => buildSeedPanel(store, patches, interactive),
    items: () => buildItems(store, resolver, patches, { interactive, itemSize }),
    dungeons: () => buildTriforce(store, resolver, patches, interactive),
    locations: () => buildLocations(store, resolver, patches, interactive, compact),
    hintlog: () => buildHintTracker(store, patches, interactive),
    map: () => buildMap(store, resolver, patches, interactive),
  };

  // Items and the Triforce share a row when both are shown — the triangle is
  // narrow and was leaving most of its own panel empty.
  const built = new Map<TrackerSection, HTMLElement>();
  for (const name of sections) {
    // An unknown `?sections=` value must not take the whole overlay down.
    const build = builders[name];
    if (build) built.set(name, build());
  }
  const items = built.get('items');
  const triforce = built.get('dungeons');
  if (items && triforce) items.classList.add('z1r-items-panel');
  for (const [name, node] of built) {
    if (name === 'dungeons' && items && triforce) continue;
    if (name === 'items' && items && triforce) {
      const pair = el('div', 'z1r-pair');
      pair.append(items, triforce);
      root.append(pair);
      continue;
    }
    root.append(node);
  }

  // Isolated per panel: the store has already committed this state, so a throw
  // here would otherwise leave every later panel showing the previous one.
  const apply = (state: TrackerState) => runPatches(patches, state);

  /*
   * Publish the tracker's own width as a band.
   *
   * Layout rules key off this rather than a media query, because the OBS
   * overlay lays out at a fixed composition width inside a Browser Source of
   * some other size — so the viewport describes the wrong box entirely.
   */
  const applyWidthBand = () => {
    const width = root.offsetWidth;
    root.dataset.width = width < 640 ? 'xs' : width < 720 ? 'sm' : 'md';
  };

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
    for (const grid of root.querySelectorAll<HTMLElement>('.z1r-item-grid')) {
      /*
       * Overlay only. The web and desktop panels have room to let cells stretch
       * to fill, which is what `auto-fill` with a `1fr` track already does well;
       * balancing there would shrink every cell to its minimum and centre the
       * block, which is a change to those apps that nobody asked for.
       */
      if (mode !== 'overlay') {
        if (grid.style.gridTemplateColumns) grid.style.removeProperty('grid-template-columns');
        continue;
      }

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
  /*
   * Folding is for the dock and the page, never the overlay: a browser source
   * takes no clicks, so a caret there would be furniture that cannot be used.
   */
  if (interactive) wireCollapsing(root);

  applyLayout();
  const widthObserver = new ResizeObserver(applyLayout);
  widthObserver.observe(root);

  apply(store.getState());
  const unsubscribe = store.subscribe(apply);

  return () => {
    unsubscribe();
    widthObserver.disconnect();
    root.replaceChildren();
    root.classList.remove('z1r-tracker');
  };
}

/* -------------------------------------------------------------------- items */

function buildItems(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  opts: { interactive: boolean; itemSize: number },
): HTMLElement {
  const { root, body } = section('Items', 'z1r-item-groups');
  const cellPatches: Patch[] = [];

  // Two groups, in the game's own order: always-active items on top, then the
  // boxed B-slot items, mirroring the inventory screen.
  for (const [group, caption] of [
    ['passive', 'Always active'],
    ['bslot', 'B slot'],
  ] as const) {
    const wrap = el('div', 'z1r-item-group');
    wrap.dataset.group = group;
    wrap.append(el('span', 'z1r-item-group-label', caption));
    const grid = el('div', 'z1r-item-grid');
    for (const def of ITEMS.filter((item) => item.group === group)) {
      grid.append(buildItemCell(store, resolver, def, cellPatches, opts));
    }
    wrap.append(grid);
    body.append(wrap);
  }

  // Per cell, not per panel: these eighteen shared one registered patch, so a
  // throw in one dropped every cell after it.
  patches.push((state) => runPatches(cellPatches, state));

  return root;
}

function buildItemCell(
  store: Store,
  resolver: SpriteResolver,
  def: ItemDef,
  patches: Patch[],
  opts: { interactive: boolean; itemSize: number },
): HTMLElement {
  const cell = el('button', 'z1r-item');
  cell.type = 'button';
  cell.dataset.itemId = def.id;
  cell.dataset.group = def.group;
  if (!opts.interactive) cell.disabled = true;

  // The sprite is swapped wholesale on stage change, so keep a slot to swap in.
  const slot = el('span', 'z1r-item-sprite');
  const badge = el('span', 'z1r-item-badge');
  cell.append(slot, badge);

  if (opts.interactive) {
    const step = (direction: 1 | -1) =>
      store.dispatch({ type: 'cycleItem', id: def.id, direction });
    cell.addEventListener('click', (event) => step(event.shiftKey ? -1 : 1));
    cell.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      step(-1);
    });
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        step(-1);
      }
    });
  }

  let renderedSprite: string | null = null;

  patches.push((state) => {
    const value = state.items[def.id] ?? 0;
    const key = spriteFor(def, value);
    renderedSprite = memoise(renderedSprite, key, () => {
      slot.replaceChildren(createSprite(resolver, key, { size: opts.itemSize }));
    });
    cell.dataset.owned = String(value > 0);
    cell.title = def.note ? `${labelFor(def, value)} — ${def.note}` : labelFor(def, value);
    cell.setAttribute('aria-pressed', String(value > 0));
    cell.setAttribute('aria-label', `${labelFor(def, value)} — ${value > 0 ? 'held' : 'not held'}`);

    if (def.kind === 'progressive' && value > 0 && maxValue(def) > 1) {
      badge.textContent = String(value);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  });

  return cell;
}

/* ---------------------------------------------------------------- overworld */

function buildMap(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
): HTMLElement {
  const { root, body } = section('Overworld', 'z1r-map');
  // The palette is positioned against this panel.
  root.classList.add('z1r-map-panel');
  body.style.setProperty('--map-columns', String(OVERWORLD_COLUMNS));
  const heading = root.querySelector('.z1r-panel-title');

  // Hint regions are baked into the grid rather than left in a reference
  // image: a hint names a region, so the map should be able to answer "which
  // screens is that?" directly.
  const regionToggle = el('button', 'z1r-chip-button z1r-regions-toggle', 'Regions');
  regionToggle.type = 'button';
  regionToggle.dataset.open = 'false';
  regionToggle.title = 'Label every screen with its hint region code';
  regionToggle.addEventListener('click', () => {
    const on = regionToggle.dataset.open !== 'true';
    regionToggle.dataset.open = String(on);
    body.dataset.regions = String(on);
  });
  body.dataset.regions = 'false';
  heading?.append(regionToggle);

  /*
   * Each cell shows its own screen from the real overworld map.
   *
   * The map is 1280x468 with a legend strip below y=440, so the map proper is
   * exactly 16x8 screens of 80x55 — which is the NES screen aspect (1.4545)
   * and the grid's existing 16/11 cell ratio. One image is positioned inside
   * every cell rather than sliced into 128 files.
   */
  const MAP_COLUMNS_PERCENT = 16 * 100;
  const MAP_ROWS_PERCENT = (468 / 440) * 8 * 100;
  const mapKey = () =>
    store.getState().seed.mirroredOverworld ? 'ref.overworld.mirrored' : 'ref.overworld';

  /*
   * Marker toolbar, fixed above the map.
   *
   * This was a popover anchored to whichever cell you clicked. In play that was
   * the wrong shape entirely: it covered a big piece of the map, it could not be
   * dismissed without picking something, and choosing a screen in the lower half
   * scrolled the page to fit the popover on screen — mid-run, one-handed.
   *
   * It works like a brush now. Pick what you are placing here, then click
   * screens to place it, as many as you like. Marking a row of dead ends takes
   * one selection and a few clicks rather than a popover each.
   */
  const toolbar = el('div', 'z1r-map-tools');
  // Into the panel, ahead of the grid — *not* into `body`, which is the grid
  // itself. Appending it there made it a grid item one column wide, so every
  // button stacked vertically and the first row of screens filled in beside it.
  root.insertBefore(toolbar, body);

  let brush: MarkKind = 'dungeon';
  let brushLevel = 0;
  let brushSpot = '';
  let brushItem = '';
  const brushStock = new Set<string>();

  const kindRow = el('div', 'z1r-tool-row z1r-tool-kinds');
  toolbar.append(kindRow);
  const kindButtons: HTMLButtonElement[] = [];

  /** Detail rows appear only for the brush that uses them. */
  const detailRows: { row: HTMLElement; forKind: MarkKind }[] = [];
  const detailRow = (forKind: MarkKind, label: string) => {
    const row = el('div', 'z1r-tool-row z1r-tool-detail');
    // Labelled for screen readers rather than on screen. Only one detail row is
    // ever visible, and which one is already answered by the selected brush.
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label);
    toolbar.append(row);
    detailRows.push({ row, forKind });
    return row;
  };

  const syncToolbar = () => {
    for (const button of kindButtons) {
      const active = button.dataset.mark === brush;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const { row, forKind } of detailRows) row.hidden = forKind !== brush;
    for (const button of levelButtons) {
      button.dataset.active = String(Number(button.dataset.level) === brushLevel);
    }
    for (const button of stockButtons) {
      button.dataset.active = String(brushStock.has(button.dataset.stock ?? ''));
    }
    if (document.activeElement !== spotSelect) spotSelect.value = brushSpot;
    if (document.activeElement !== itemSelect) itemSelect.value = brushItem;
  };

  for (const mark of MARKS) {
    const button = el('button', 'z1r-tool-mark');
    button.type = 'button';
    button.dataset.mark = mark.kind;
    button.style.setProperty('--mark-color', mark.color);
    if (mark.sprite) {
      button.append(createSprite(resolver, mark.sprite, { size: 18, label: mark.name }));
    } else {
      button.append(el('span', 'z1r-tool-mark-clear', '—'));
    }
    /*
     * Icon only. The name rides on `title` and `aria-label` instead — the row
     * is five buttons that never change, so it is learned in one glance and
     * then only costs space. Selection is still shown by fill *and* by an
     * outline, so it is not carried by colour.
     */
    button.title =
      mark.kind === 'none' ? 'Clear a screen (or right-click it)' : `Place: ${mark.name}`;
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', () => {
      brush = mark.kind;
      syncToolbar();
    });
    kindButtons.push(button);
    kindRow.append(button);
  }

  /* Which dungeon the next click places. `?` is found-but-unidentified. */
  const levelRow = detailRow('dungeon', 'Level');
  const levelButtons: HTMLButtonElement[] = [];
  for (const level of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const button = el('button', 'z1r-mark-level', level === 0 ? '?' : String(level));
    button.type = 'button';
    button.dataset.level = String(level);
    button.title = level === 0 ? 'Found, not yet identified' : `Level ${level}`;
    button.addEventListener('click', () => {
      brushLevel = level;
      syncToolbar();
    });
    levelButtons.push(button);
    levelRow.append(button);
  }

  /* What the shop sells. Multi-select, since most sell more than one thing. */
  const stockRow = detailRow('shop', 'Sells');
  const stockButtons: HTMLButtonElement[] = [];
  for (const stock of SHOP_STOCK) {
    const button = el('button', 'z1r-mark-stock-option');
    button.type = 'button';
    button.dataset.stock = stock.id;
    button.title = stock.name;
    button.setAttribute('aria-label', stock.name);
    button.append(createSprite(resolver, stock.sprite, { size: 18, label: stock.name }));
    button.addEventListener('click', () => {
      if (brushStock.has(stock.id)) brushStock.delete(stock.id);
      else brushStock.add(stock.id);
      syncToolbar();
    });
    stockButtons.push(button);
    stockRow.append(button);
  }

  /*
   * Item screens: which spot it is, and what is sitting in it.
   *
   * Two questions, because they are answered at different times. You find the
   * White Sword cave long before you can afford the hearts to open it, and the
   * Coast is visible from the first lap and unreachable until the Ladder.
   */
  const itemRow = detailRow('item', 'Item spot');
  const spotSelect = document.createElement('select');
  spotSelect.className = 'z1r-input z1r-tool-select';
  spotSelect.title = 'Which named overworld spot this screen is';
  const anySpot = document.createElement('option');
  anySpot.value = '';
  anySpot.textContent = 'Unnamed spot';
  spotSelect.append(anySpot);
  for (const location of OVERWORLD_LOCATIONS) {
    const option = document.createElement('option');
    option.value = location.id;
    option.textContent = location.label;
    spotSelect.append(option);
  }
  spotSelect.addEventListener('change', () => {
    brushSpot = spotSelect.value;
  });

  const itemSelect = document.createElement('select');
  itemSelect.className = 'z1r-input z1r-tool-select';
  itemSelect.title = 'Which item is in it';
  const unknownItem = document.createElement('option');
  unknownItem.value = '';
  unknownItem.textContent = 'Item unknown';
  itemSelect.append(unknownItem);
  for (const entry of SHUFFLE_POOL) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    itemSelect.append(option);
  }
  itemSelect.addEventListener('change', () => {
    brushItem = itemSelect.value;
  });
  itemRow.append(spotSelect, itemSelect);

  /** Applies the current brush, detail and all, to one screen. */
  const paint = (screen: string) => {
    store.dispatch({ type: 'setMark', screen, mark: brush });
    if (brush === 'dungeon') {
      store.dispatch({ type: 'setScreenNote', screen, patch: { dungeon: brushLevel } });
    } else if (brush === 'shop') {
      // Sent whole rather than toggled, so a screen ends up with exactly what
      // the toolbar shows rather than the difference from what was there.
      store.dispatch({ type: 'setScreenNote', screen, patch: { shop: [...brushStock].sort() } });
    } else if (brush === 'item') {
      store.dispatch({
        type: 'setScreenNote',
        screen,
        patch: { spot: brushSpot, item: brushItem },
      });
    }
  };

  syncToolbar();

  const focusNote = el('span', 'z1r-map-focus');
  heading?.append(focusNote);
  patches.push((state) => {
    const def = state.focusRegion ? REGIONS_BY_ID.get(state.focusRegion) : undefined;
    focusNote.textContent = def ? `showing ${def.code} · ${def.name}` : '';
    focusNote.hidden = !def;
  });

  for (let row = 1; row <= OVERWORLD_ROWS; row++) {
    for (let col = 1; col <= OVERWORLD_COLUMNS; col++) {
      const id = screenId(col, row);
      const cell = el('button', 'z1r-screen');
      cell.type = 'button';
      cell.dataset.screen = id;
      cell.title = id;
      if (!interactive) cell.disabled = true;
      else {
        cell.addEventListener('click', () => paint(id));
        // Right-click clears outright — the common correction, and faster than
        // opening the palette to pick "Unmarked".
        cell.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          store.dispatch({ type: 'setMark', screen: id, mark: 'none' });
        });
        // Arrow keys still step through the marks without opening anything,
        // which is quicker than the palette when tagging a run of screens.
        cell.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          store.dispatch({
            type: 'cycleMark',
            screen: id,
            direction: event.key === 'ArrowRight' ? 1 : -1,
          });
        });
      }

      const terrain = el('span', 'z1r-screen-terrain');
      const terrainImage = el('img');
      terrainImage.alt = '';
      /*
       * Eager, not lazy.
       *
       * All 128 share one URL, so this is a single request however it is
       * scheduled — lazy loading saves nothing and adds a way to fail. It was
       * observed leaving images pending indefinitely even with the cell in
       * view, which presents as a half-drawn map with no error anywhere.
       */
      terrainImage.loading = 'eager';
      terrainImage.decoding = 'async';
      // The wiki hosting this map serves a 200x73 thumbnail rather than the
      // 1280x468 original when a request carries a Referer, which is what made
      // the map blurry in OBS and sharp in a browser that sent none.
      terrainImage.referrerPolicy = 'no-referrer';
      terrainImage.style.width = `${MAP_COLUMNS_PERCENT}%`;
      terrainImage.style.height = `${MAP_ROWS_PERCENT}%`;
      terrainImage.style.insetInlineStart = `${-(col - 1) * 100}%`;
      terrainImage.style.insetBlockStart = `${-(row - 1) * 100}%`;
      terrain.append(terrainImage);

      // The region code is the non-colour channel: two letters, always legible,
      // where a tint alone would be unreadable to a colour-blind viewer.
      const code = el('span', 'z1r-screen-region');
      const slot = el('span', 'z1r-screen-mark');
      // Detail drawn over the mark: the dungeon's number, or the shop's stock
      // as two-letter tags. Both are text, so they survive being shrunk into a
      // dock and read without depending on colour.
      const detail = el('span', 'z1r-screen-detail');
      cell.append(terrain, code, slot, detail);

      let renderedMap: string | null = null;
      patches.push(() => {
        const key = mapKey();
        renderedMap = memoise(renderedMap, key, () => {
          const resolved = resolver.resolve(key);
          // A missing or unreachable map just leaves the cell blank; the codes
          // and marks carry the tracker's own information regardless.
          terrainImage.src = resolved.kind === 'image' ? resolved.url : '';
        });
      });

      let renderedMark: string | null = null;
      let renderedRegion: string | null = null;
      let renderedDetail: string | null = null;

      patches.push((state) => {
        const mark = state.marks[id] ?? 'none';
        const def = MARKS_BY_KIND.get(mark);
        renderedMark = memoise(renderedMark, mark, () => {
          cell.dataset.mark = mark;
          cell.style.setProperty('--mark-color', def?.color ?? 'transparent');
          if (!def?.sprite) slot.replaceChildren();
          else slot.replaceChildren(createSprite(resolver, def.sprite, { size: 18, label: def.name }));
        });

        const note = state.screenNotes[id];
        const isCoast = note?.spot === COAST_SPOT_ID;
        // The coast ledge is reachable the moment the Ladder is in hand — and
        // that is exactly when you have forgotten it is there.
        const coastReady = isCoast && (state.items[COAST_ITEM_REQUIRES] ?? 0) >= 1;
        // Level 9 is the one dungeon you cannot enter on sight, so its marker
        // is worth calling out the moment the last piece lands.
        const level9Ready = note?.dungeon === 9 && canEnterLevel9(state);

        const detailKey = [
          mark,
          note?.dungeon ?? 0,
          note?.shop.join('') ?? '',
          note?.spot ?? '',
          note?.item ?? '',
          isCoast,
          coastReady,
          level9Ready,
        ].join('|');
        renderedDetail = memoise(renderedDetail, detailKey, () => {
          cell.dataset.coast = String(isCoast);
          cell.dataset.coastReady = String(coastReady);
          cell.dataset.ready = String(level9Ready);

          if (mark === 'dungeon') {
            detail.textContent = note?.dungeon ? String(note.dungeon) : '?';
          } else if (mark === 'shop' && note?.shop.length) {
            detail.textContent = note.shop
              .map((stock) => SHOP_STOCK_BY_ID.get(stock)?.code ?? '')
              .join(' ');
          } else if (mark === 'item') {
            /*
             * The contents win over the name of the spot. Once you know the
             * White Sword cave holds the Raft, "RA" is what you are scanning
             * the map for; that it is the White Sword cave is in the tooltip
             * and rarely what you need at a glance.
             */
            const held = note?.item ? POOL_BY_ID.get(note.item)?.name : '';
            const spot = note?.spot
              ? OVERWORLD_LOCATIONS.find((l) => l.id === note.spot)?.label
              : '';
            detail.textContent = shortCode(held) || shortCode(spot) || '?';
          } else {
            // `visited` says everything in its icon — a screen with nothing on
            // it needs no label, and the map is mostly these by the end.
            detail.textContent = '';
          }
          detail.hidden = detail.textContent === '';
        });

        const region = regionForScreen(id, state.seed.mirroredOverworld);
        const regionKey = `${region?.id ?? ''}:${state.focusRegion}`;
        renderedRegion = memoise(renderedRegion, regionKey, () => {
          code.textContent = region?.code ?? '';
          cell.dataset.region = region?.id ?? '';
          cell.style.setProperty('--region-color', region?.color ?? 'transparent');
          cell.dataset.focused = String(!!region && region.id === state.focusRegion);
        });

        const parts = [id];
        if (region) parts.push(region.name);
        if (mark === 'dungeon') {
          parts.push(note?.dungeon ? `Level ${note.dungeon}` : 'Dungeon (unidentified)');
          if (level9Ready) parts.push('every Triforce piece held — Level 9 is open');
        } else if (mark === 'shop') {
          const stock = note?.shop.map((s) => SHOP_STOCK_BY_ID.get(s)?.name ?? s) ?? [];
          parts.push(stock.length ? `Shop: ${stock.join(', ')}` : 'Shop');
        } else if (mark === 'item') {
          const spot = note?.spot
            ? OVERWORLD_LOCATIONS.find((l) => l.id === note.spot)?.label
            : '';
          parts.push(spot || 'Item');
          parts.push(note?.item ? (POOL_BY_ID.get(note.item)?.name ?? '') : 'contents unknown');
          if (isCoast) {
            parts.push(coastReady ? 'Ladder held — reachable now' : 'needs the Ladder');
          }
        } else if (def && mark !== 'none') {
          parts.push(def.name);
        }
        cell.title = parts.join(' — ');
      });

      body.append(cell);
    }
  }

  return root;
}

