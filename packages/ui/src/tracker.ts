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
  dungeonItems,
  safeStorage,
  COAST_ITEM_REQUIRES,
  coastScreen,
  DUNGEON_BLOCKS,
  DUNGEON_BLOCKS_BY_ID,
  DUNGEONS,
  deriveItemLocations,
  OVERWORLD_LOCATIONS,
  MARKS,
  MARKS_BY_KIND,
  OVERWORLD_COLUMNS,
  overworldMap,
  OVERWORLD_ROWS,
  OVERWORLD_STAIRWAY_COUNT,
  warpRoutes,
  POOL_BY_ID,
  ROOM_ITEMS,
  ROOM_ITEMS_BY_ID,
  REGIONS_BY_ID,
  regionForScreen,
  SECRET_SIZES,
  SECRET_SIZES_BY_ID,
  SHOP_STOCK,
  SHOP_STOCK_BY_ID,
  SCREEN_ITEMS,
  SCREEN_ITEMS_BY_ID,
  ITEMS,
  ITEMS_BY_ID,
  labelFor,
  maxValue,
  screenId,
  spriteFor,
  type ItemDef,
  type MarkKind,
  type RoomItemDef,
  type ScreenNote,
  type SecretSize,
  type SpriteResolver,
  type Store,
  type TrackerState,
} from '@z1r/core';
import { createSprite } from './sprite.js';
import { askToConfirm } from './confirm/ask.js';
import { placedIndex, placedSuffix } from './placed.js';
import { mountItemPalette, targetFor } from './palette/mount.js';
import { mountPanelToggle } from './panel/mount.js';
import { MAP_PREVIEW_EVENT, type MapPreview } from './map-preview.js';
import {
  mountMapBrushes,
  mountMapHeading,
  mountScreenCard,
  type Armed,
  type MapActions,
  type MapView,
} from './overworld/mount.js';
import { memoise, runPatches, type Patch } from './patch.js';
import { buildSeedPanel } from './seed-panel.js';
import { buildLocations } from './locations.js';
import { buildHintTracker } from './hints.js';
import { buildTriforce } from './triforce.js';
import {
  buildRooms,
  createPlacement,
  roomItemsForInventory,
  type PlacementChannel,
} from './rooms.js';

export type TrackerSection =
  | 'seed'
  | 'items'
  | 'dungeons'
  | 'locations'
  | 'hintlog'
  | 'map'
  | 'rooms';

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
  /**
   * Panels a first-time visitor finds folded, named by their heading text —
   * the same key `wireCollapsing` stores, so `['Seed', 'Hints']` folds those
   * two.
   *
   * Only ever a *default*. Once this window has saved a folded set of its own
   * it wins outright, so a panel someone chose to open stays open.
   *
   * Per app rather than global: the OBS dock and the map dock mount in the
   * same `full` mode as the page, and neither should start folding panels
   * because the page wanted to.
   */
  readonly defaultCollapsed?: readonly string[];
}

/*
 * Seed and the hint log are not among the defaults: the page and the desktop
 * build open both from the toolbar's sheets instead (`mountControls`). Both
 * are still sections for the windows that ask for them by name — the OBS map
 * dock, which has no toolbar and keeps its hints beside its map, and the
 * overlay.
 */
const DEFAULT_SECTIONS: readonly TrackerSection[] = [
  'items',
  'dungeons',
  'locations',
  'map',
  // Last, below the overworld. The room sheet is the panel you lean into for a
  // level at a time; the overworld is the one that stays put and gets glanced
  // at, so it keeps the top of the page.
  'rooms',
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

/**
 * How many stock icons a shop tile draws.
 *
 * A map cell is about 50x34 CSS pixels at dock width, which is three columns of
 * roughly 16px: a 14px sprite and a price of up to three digits under it. A
 * fourth column would be legible as neither. Anything past the third is
 * counted in the corner and spelled out in full in the tooltip.
 */
const MAX_SHOP_ICONS = 3;

function section(title: string, bodyClass: string): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', 'z1r-panel');
  root.append(el('h2', 'z1r-panel-title', title));
  const body = el('div', bodyClass);
  root.append(body);
  return { root, body };
}

/** Which panels are folded away. A view preference, not run data. */
const COLLAPSE_KEY = 'z1r-tracker:collapsed';

/**
 * The folded set this window has saved, or `null` if it has never saved one.
 *
 * The distinction is the whole point of the return type. "Nothing is folded"
 * and "nobody has ever said" look identical as an empty set, and the caller
 * has to tell them apart: the first is a choice to keep everything open and
 * must be honoured, the second is a first visit and gets the app's defaults.
 * A missing key is the only reliable record of "never chosen" — it is written
 * the first time anything is folded or unfolded and never removed after.
 */
function readCollapsed(): Set<string> | null {
  try {
    const raw = safeStorage()?.getItem(COLLAPSE_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
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
function wireCollapsing(root: HTMLElement, defaults: readonly string[] = []): void {
  /*
   * A saved set beats the defaults, including an empty saved set.
   *
   * Which is what keeps this from overriding the user: the moment anything is
   * folded or unfolded, the full set is written, so a panel that was opened on
   * purpose is recorded as open and the default never gets a second go at it.
   */
  const collapsed = readCollapsed() ?? new Set(defaults);

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

    // The caret is React, see `panel/`; it draws itself from `setState`.
    const toggleHost = el('span', 'z1r-panel-togglehost');
    const toggle = mountPanelToggle(toggleHost);
    const flip = () => {
      const folded = panel.dataset.collapsed !== 'true';
      if (folded) collapsed.add(name);
      else collapsed.delete(name);
      setState(folded);
      persist();
    };
    const setState = (folded: boolean) => {
      panel.dataset.collapsed = String(folded);
      toggle.render({ name, folded, onToggle: flip });
    };

    title.prepend(toggleHost);

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
    defaultCollapsed = [],
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

  /*
   * Where an armed item lives while it is in the air.
   *
   * Shared by the palette, which arms it, and the panels that drop it — the
   * room sheet and the overworld map, all built by this same call. It is
   * deliberately not store state: see `createPlacement`.
   */
  const placement = createPlacement();

  /*
   * Which panels in this mount can receive a placement.
   *
   * Arming is view state that reaches the panels of this one mount and no
   * others, by design — so a window with the inventory and nothing to place
   * onto keeps the inventory it always had rather than growing a palette whose
   * picks could land nowhere.
   */
  const placeInto = {
    rooms: sections.includes('rooms'),
    map: sections.includes('map'),
  };
  /*
   * The Items panel is a placement palette on the page and nowhere else.
   *
   * The OBS dock is `compact`, and it is where the inventory gets marked held
   * mid-stream, so its cells keep the click-to-raise they have always had. The
   * overlay takes no clicks at all. What is left is the page — and the desktop
   * build, which mounts the same panels the same way.
   */
  const palette = interactive && !compact && (placeInto.rooms || placeInto.map);
  /*
   * Whether Item locations goes in the palette's card — see the card below.
   * When it does, it is the compact panel, whose columns carry the Triforce
   * pieces, so the Triforce panel is not built at all.
   */
  const inCard = palette && sections.includes('items') && sections.includes('locations');

  const builders: Record<TrackerSection, () => HTMLElement> = {
    seed: () => buildSeedPanel(store, patches, interactive),
    items: () =>
      palette
        ? buildPalette(store, resolver, patches, { itemSize, placement, placeInto })
        : buildItems(store, resolver, patches, {
            interactive,
            itemSize,
            // The browser sources keep the split; a page does not.
            grouped: mode === 'overlay' || compact,
          }),
    dungeons: () => buildTriforce(store, resolver, patches, interactive),
    // In the Items card the compact panel is used: a column per level headed by
    // its Triforce piece, which covers the Triforce panel as well.
    locations: () => buildLocations(store, resolver, patches, interactive, compact || inCard),
    hintlog: () => buildHintTracker(store, patches, interactive),
    map: () => buildMap(store, resolver, patches, interactive, placement),
    rooms: () => buildRooms(store, resolver, patches, interactive, placement),
  };

  /*
   * Escape puts the armed item down, wherever focus happens to be.
   *
   * On the document rather than on a panel, because the last click before it
   * was on a room or a screen — or on nothing at all — and the key has to work
   * from any of them. Captured, and stopped when it is spent: the map listens
   * for Escape too, to let go of its selected screen, and one key press should
   * not do two things. The armed item goes first because it is the state that
   * changes what the next click does.
   */
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !placement.get().item) return;
    event.stopPropagation();
    placement.set({ item: '' });
  };
  if (palette && sections.includes('items')) {
    document.addEventListener('keydown', onEscape, true);
  }

  // Items and the Triforce share a row when both are shown — the triangle is
  // narrow and was leaving most of its own panel empty.
  const built = new Map<TrackerSection, HTMLElement>();
  for (const name of sections) {
    if (name === 'dungeons' && inCard) continue;
    // An unknown `?sections=` value must not take the whole overlay down.
    const build = builders[name];
    if (build) built.set(name, build());
  }
  const items = built.get('items');
  const triforce = built.get('dungeons');
  const locations = built.get('locations');

  /*
   * On the page, the palette's card also holds Item locations: the palette
   * wraps on the left, the compact locations panel sits to its right, its
   * columns headed by each level's Triforce piece.
   *
   * It is what the palette's placements fill in, so the two read as one tool.
   * It keeps its own heading and fold; folding Items folds both, because the
   * card is one child of the Items panel and a folded panel hides everything
   * but its title.
   */
  const card = palette && items ? [locations, triforce].filter((n): n is HTMLElement => !!n) : [];
  if (items && card.length) {
    const body = items.querySelector<HTMLElement>('.z1r-palette');
    const row = el('div', 'z1r-items-card');
    if (body) row.append(body);
    for (const node of card) {
      node.dataset.nested = 'true';
      row.append(node);
    }
    items.append(row);
  }

  if (items && triforce && !card.length) items.classList.add('z1r-items-panel');
  for (const [name, node] of built) {
    if (card.includes(node)) continue;
    const paired = !!items && !!triforce && !card.includes(triforce);
    if (name === 'dungeons' && paired) continue;
    if (name === 'items' && paired) {
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
  if (interactive) wireCollapsing(root, defaultCollapsed);

  applyLayout();
  const widthObserver = new ResizeObserver(applyLayout);
  widthObserver.observe(root);

  apply(store.getState());
  const unsubscribe = store.subscribe(apply);

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', onEscape, true);
    widthObserver.disconnect();
    root.replaceChildren();
    root.classList.remove('z1r-tracker');
  };
}

/* -------------------------------------------------------------------- items */

/**
 * The inventory, as the OBS dock and overlay show it.
 *
 * A click raises an item and Shift+click or a right click lowers it. This is
 * what the dock is for during a stream, so it is kept exactly as it was; the
 * page builds `buildPalette` in its place.
 */
function buildItems(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  opts: {
    interactive: boolean;
    itemSize: number;
    /** Keep the inventory screen's always-active / B-slot split. */
    grouped: boolean;
  },
): HTMLElement {
  const { root, body } = section('Items', 'z1r-item-groups');
  const cellPatches: Patch[] = [];

  /*
   * The cell is the sprite plus its own padding and border, so the grid's
   * minimum track follows `itemSize` rather than a fixed 44px that stayed
   * put however small the art was asked to be.
   */
  root.style.setProperty('--z1r-item-min', `${opts.itemSize + 10}px`);

  const placedAt = new Map<string, string[]>();
  const cellOpts = { ...opts, placedAt };

  /*
   * One grid on a page, two labelled groups on a stream.
   *
   * The inventory screen's own split — always-active on top, the boxed B-slot
   * below — cost two captions, two gaps and a border drawn around whatever
   * empty space the B-slot row did not fill. On a page that is furniture: the
   * items are in the game's order either way, and which half an item lives in
   * is not a question anyone asks the tracker. The browser sources keep the
   * split, because they are composed by hand against a stream layout and the
   * overlay balances each grid's columns separately.
   */
  const buildGroup = (group: 'passive' | 'bslot', grid: HTMLElement) => {
    for (const def of ITEMS.filter((item) => item.group === group)) {
      grid.append(buildItemCell(store, resolver, def, cellPatches, cellOpts));
    }
  };

  if (opts.grouped) {
    for (const [group, caption] of [
      ['passive', 'Always active'],
      ['bslot', 'B slot'],
    ] as const) {
      const wrap = el('div', 'z1r-item-group');
      wrap.dataset.group = group;
      wrap.append(el('span', 'z1r-item-group-label', caption));
      const grid = el('div', 'z1r-item-grid');
      buildGroup(group, grid);
      wrap.append(grid);
      body.append(wrap);
    }
  } else {
    const wrap = el('div', 'z1r-item-group');
    wrap.dataset.group = 'all';
    const grid = el('div', 'z1r-item-grid');
    buildGroup('passive', grid);
    buildGroup('bslot', grid);
    wrap.append(grid);
    body.append(wrap);
  }

  const own: Patch[] = [
    (state) => {
      placedAt.clear();
      for (const [item, where] of placedIndex(state)) placedAt.set(item, where);
    },
    // Per cell, not per panel: these eighteen shared one registered patch, so a
    // throw in one dropped every cell after it.
    (state) => runPatches(cellPatches, state),
  ];

  patches.push((state) => runPatches(own, state));
  return root;
}

function buildItemCell(
  store: Store,
  resolver: SpriteResolver,
  def: ItemDef,
  patches: Patch[],
  opts: {
    interactive: boolean;
    itemSize: number;
    placedAt: Map<string, string[]>;
  },
): HTMLElement {
  const { placedAt } = opts;
  const cell = el('button', 'z1r-item');
  cell.type = 'button';
  cell.dataset.itemId = def.id;
  // The hook the OBS Custom CSS is written against. `data-item-id` stays as
  // well: rules already exist against it, and dropping it would break them.
  cell.dataset.item = def.id;
  cell.dataset.group = def.group;
  cell.dataset.armed = 'false';
  cell.dataset.placed = 'false';
  if (!opts.interactive) cell.disabled = true;

  /** Every room item this cell can stand for — a chain covers more than one. */
  const covers = roomItemsForInventory(def);
  cell.dataset.placeable = String(covers.length > 0);

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
    // Mirrors `data-owned` under the name the room sheet's stable hooks use.
    cell.dataset.held = String(value > 0);
    cell.dataset.placed = String(covers.some((id) => (placedAt.get(id)?.length ?? 0) > 0));

    const held = labelFor(def, value);
    const base = def.note ? `${held} — ${def.note}` : held;
    const where = placedSuffix(covers, placedAt);
    cell.title = `${base}${where}`;
    cell.setAttribute('aria-pressed', String(value > 0));
    cell.setAttribute('aria-label', `${held} — ${value > 0 ? 'held' : 'not held'}${where}`);

    if (def.kind === 'progressive' && value > 0 && maxValue(def) > 1) {
      badge.textContent = String(value);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  });

  return cell;
}

/* ------------------------------------------------------------------ palette */

/**
 * The Items panel on the page: an always-on placement palette.
 *
 * The section, its heading and the line saying what the next click does stay
 * plain DOM, so folding and the Items card's nesting work as they do for every
 * panel. The tiles and the tier popover are React — see `palette/`.
 *
 * Only the page builds this; the OBS dock and overlay keep the inventory grid.
 */
function buildPalette(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  opts: {
    itemSize: number;
    placement: PlacementChannel;
    /** Which panels of this mount a placement can land on. */
    placeInto: { rooms: boolean; map: boolean };
  },
): HTMLElement {
  const { placement, placeInto, itemSize } = opts;
  const { root, body } = section('Items', 'z1r-palette');
  root.classList.add('z1r-palette-panel');
  root.style.setProperty('--z1r-item-min', `${itemSize + 10}px`);
  const heading = root.querySelector('.z1r-panel-title');

  /*
   * One line saying what the next click does.
   *
   * In the heading rather than under the grid, so the panel is no taller for
   * it, and in words — the armed tile's ring is the other channel.
   */
  const status = el('span', 'z1r-palette-status');
  status.setAttribute('aria-live', 'polite');
  heading?.append(status);

  const palette = mountItemPalette(body);
  const arm = (item: string) => placement.set({ item });
  const step = (id: string, direction: 1 | -1) => store.dispatch({ type: 'cycleItem', id, direction });

  const draw = (state: TrackerState) => {
    const armed = placement.get().item;
    // Either list: the overworld-only items are not room items.
    const def = armed ? (ROOM_ITEMS_BY_ID.get(armed) ?? SCREEN_ITEMS_BY_ID.get(armed)) : undefined;
    root.dataset.armed = String(!!def);
    status.textContent = def
      ? `${def.name} armed — click ${targetFor(def.id, placeInto)}. Esc puts it down.`
      : 'Click an item to place it. Right-click marks it held.';
    palette.render({
      state,
      armed,
      placedAt: placedIndex(state),
      resolver,
      itemSize,
      placeInto,
      arm,
      step,
    });
  };

  patches.push(draw);
  // Arming changes nothing in the store, so the channel drives its own redraw.
  placement.watch(() => draw(store.getState()));

  return root;
}

/* ---------------------------------------------------------------- overworld */

function buildMap(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
  placement: PlacementChannel,
): HTMLElement {
  const { root, body } = section('Overworld', 'z1r-map');
  // The palette is positioned against this panel.
  root.classList.add('z1r-map-panel');
  body.style.setProperty('--map-columns', String(OVERWORLD_COLUMNS));
  const heading = root.querySelector('.z1r-panel-title');

  /*
   * The heading's controls: Regions, the warp count, which region a hint is
   * showing, and Clear — React, see `overworld/`.
   *
   * Regions labels every screen with its hint region code: a hint names a
   * region, so the map should answer "which screens is that?" directly. It is
   * view state, held here, and Clear asks before wiping a run's worth of marks.
   */
  let regionsOn = false;
  body.dataset.regions = 'false';
  const headingHost = el('span', 'z1r-map-heading');
  heading?.append(headingHost);
  const mapHeading = mountMapHeading(headingHost);
  const clearMap = async () => {
    const marked = Object.keys(store.getState().marks).length;
    if (marked === 0) return;
    const ok = await askToConfirm({
      title: 'Clear the overworld map?',
      description: `All ${marked} marked screens are cleared. Items and the Triforce are not affected.`,
      confirm: 'Clear map',
    });
    if (ok) store.dispatch({ type: 'clearMap' });
  };
  const drawHeading = (state: TrackerState) => {
    const def = state.focusRegion ? REGIONS_BY_ID.get(state.focusRegion) : undefined;
    mapHeading.render({
      regions: regionsOn,
      onRegions: (on) => {
        regionsOn = on;
        body.dataset.regions = String(on);
        drawHeading(store.getState());
      },
      // Counted from the marks, so a stairway without its number still counts,
      // and not capped: a fifth shows as 5/4 rather than being refused.
      warpsFound: Object.values(state.marks).filter((mark) => mark === 'stairway').length,
      warpsTotal: OVERWORLD_STAIRWAY_COUNT,
      focus: def ? `showing ${def.code} · ${def.name}` : '',
      onClear: interactive ? () => void clearMap() : undefined,
    });
  };
  patches.push(drawHeading);

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
  /*
   * The Overworld Quest picks the map, Mirrored its orientation. All six are
   * the wiki's maps in the same 1280x468 layout, so the cells place any of them
   * the same way.
   */
  const mapKey = () => {
    const { overworldQuest, mirroredOverworld } = store.getState().seed;
    const quest = overworldMap(overworldQuest);
    const base = quest === '1st' ? 'ref.overworld' : `ref.overworld.${quest}`;
    return mirroredOverworld ? `${base}.mirrored` : base;
  };

  /*
   * The marker brushes, fixed above the map, and the screen card beside it.
   *
   * The brushes were once a popover anchored to the clicked cell, which
   * covered the map and scrolled the page when the cell was low on screen.
   * Fixed in the flow they cost one row and never move. The selected screen's
   * settings, and the warp routes, sit in a card beside the grid — the same
   * shape as the room card beside the dungeon sheet.
   */
  const brushHost = el('div', 'z1r-map-brushes');
  root.insertBefore(brushHost, body);
  const brushes = mountMapBrushes(brushHost);

  const mapRow = el('div', 'z1r-map-row');
  root.insertBefore(mapRow, body);
  const cardHost = el('div', 'z1r-screen-cardhost');
  mapRow.append(body, cardHost);
  const screenCard = mountScreenCard(cardHost);

  /*
   * Select a screen, then edit it.
   *
   * This was a brush — you set what you were placing, then clicked screens to
   * place it. That reads well for painting a run of dead ends and badly for
   * everything else, because it asks you to choose a dungeon's number before
   * you have said which screen the dungeon is on. Editing a screen you had
   * already marked meant re-setting every property and stamping over it.
   *
   * So: click a screen to select it, then work left to right along the toolbar
   * — Dungeon, then which level, then what blocked you. Each control writes to
   * the selected screen the moment you touch it, and the toolbar shows what
   * that screen already holds rather than what you are about to stamp.
   *
   * The toolbar stays fixed above the map, which is the half of the old popover
   * that was worth keeping: it never covers the map and never scrolls the page.
   */
  let selected = '';

  /*
   * A marker can also be *armed*, which turns the toolbar into a palette.
   *
   * Two ways of working, because a run needs both. Sweeping a region and
   * writing off a dozen dead ends wants a palette: arm the marker once, then
   * click tiles. Coming back to one screen to say which level it was and what
   * turned you back wants the opposite — pick the screen, then edit it.
   *
   * Arming does not take the editor away. A stamped tile is also selected, so
   * the detail rows are already pointing at the tile you just marked and the
   * level and blockers are right there. That is what makes the two modes one
   * flow rather than a switch: stamp, refine, stamp the next.
   */
  /** A mark, or the start pennant, which is one per map rather than a mark. */
  let armed: Armed = '';
  /** Which level the armed Dungeon marker will place. 0 means none chosen. */
  let armedLevel = 0;
  /** Which of the four the armed Stairway marker will place. 0 means none. */
  let armedStairway = 0;
  /** The size the armed Rupee secret marker stamps. Optional, unlike the two above. */
  let armedSecret: SecretSize = '';

  const highlightSelection = () => {
    for (const cell of body.querySelectorAll<HTMLElement>('.z1r-screen')) {
      cell.dataset.selected = String(cell.dataset.screen === selected);
    }
  };

  const selectScreen = (screen: string) => {
    // Clicking the selected screen again lets go of it, so there is a way out
    // that is not "find somewhere harmless to click".
    selected = selected === screen ? '' : screen;
    highlightSelection();
    syncToolbar(store.getState());
  };

  /*
   * A palette item dropped on a screen.
   *
   * The screen becomes an item screen holding that item, and is selected, so
   * the toolbar's spot and Collected controls are already pointing at it. It
   * fills an item location only once its spot is named, which is the toolbar's
   * question to ask rather than this click's. The same item on the same screen
   * again lifts it, the way a room does. Either way the item is put down.
   */
  const placeOnScreen = (screen: string, item: string) => {
    // The overworld holds shuffle-pool entries and the overworld-only items;
    // the Map, the Compass and a Triforce piece never leave their level.
    if (!SCREEN_ITEMS_BY_ID.has(item)) return;
    const state = store.getState();
    const isItem = state.marks[screen] === 'item';
    if (isItem && state.screenNotes[screen]?.item === item) {
      store.dispatch({ type: 'setScreenNote', screen, patch: { item: '' } });
    } else {
      if (!isItem) store.dispatch({ type: 'setMark', screen, mark: 'item' });
      store.dispatch({ type: 'setScreenNote', screen, patch: { item } });
    }
    // One find, one placement: the item is put down once it has landed.
    placement.set({ item: '' });
    selected = screen;
    highlightSelection();
    syncToolbar(store.getState());
  };

  /** A tile click: drop the armed item or stamp the armed marker, and edit the tile. */
  const touchScreen = (screen: string) => {
    const paletteItem = placement.get().item;
    if (paletteItem) {
      placeOnScreen(screen, paletteItem);
      return;
    }
    if (!armed) {
      selectScreen(screen);
      return;
    }
    // A dungeon needs its number first. You learn which level it is by walking
    // into it, so by the time you are marking one you know — and an unnumbered
    // dungeon marker is a note to yourself that says nothing useful.
    if (armed === 'dungeon' && !armedLevel) return;
    // A stairway the same. The four are indistinguishable on the map, so an
    // unnumbered one records nothing you did not already know from the mark.
    if (armed === 'stairway' && !armedStairway) return;

    if (armed === 'dungeon') {
      store.dispatch({ type: 'placeDungeon', screen, level: armedLevel });
    } else if (armed === 'stairway') {
      store.dispatch({ type: 'placeStairway', screen, number: armedStairway });
    } else if (armed === 'start') {
      // One per map: this moves the pennant, and leaves the screen's mark alone.
      store.dispatch({ type: 'setStartScreen', screen });
    } else {
      store.dispatch({ type: 'setMark', screen, mark: armed });
      if (armed === 'rupeeSecret' && armedSecret) {
        store.dispatch({ type: 'setScreenNote', screen, patch: { secret: armedSecret } });
      }
    }
    // Selected, not toggled — clicking an already-selected tile while armed
    // should re-stamp it, not drop the selection out from under the detail rows.
    selected = screen;
    highlightSelection();
    syncToolbar(store.getState());
  };

  /*
   * What a click on the map does, as attributes the stylesheet reads.
   *
   * A palette item counts as armed here too, but only one the overworld can
   * take: a Map armed in the palette leaves the cells saying a click places
   * nothing, which is what it does.
   */
  const syncArming = () => {
    const paletteItem = placement.get().item;
    body.dataset.armed = String(!!armed || SCREEN_ITEMS_BY_ID.has(paletteItem));
    body.dataset.refusing = String(!!paletteItem && !SCREEN_ITEMS_BY_ID.has(paletteItem));
  };

  const setArmed = (kind: Armed) => {
    armed = kind;
    if (kind !== 'dungeon') armedLevel = 0;
    if (kind !== 'stairway') armedStairway = 0;
    if (kind !== 'rupeeSecret') armedSecret = '';
    /*
     * The marker brush and the palette are exclusive. Each arms what the next
     * click on this map does, so with both armed one click would mean two
     * things; arming either puts the other down.
     */
    if (kind) placement.set({ item: '' });
    syncArming();
    syncToolbar(store.getState());
  };

  placement.watch(() => {
    if (placement.get().item && armed) setArmed('');
    else syncArming();
  });

  const patchSelected = (patch: Partial<ScreenNote>) => {
    if (!selected) return;
    store.dispatch({ type: 'setScreenNote', screen: selected, patch });
  };

  const actions: MapActions = {
    arm: (kind) => setArmed(kind),
    pickLevel: (level) => {
      if (armed === 'dungeon') {
        // Arming half of the flow: marker, then number, then click the map.
        armedLevel = level;
        syncToolbar(store.getState());
        return;
      }
      // Editing a screen already on the map. Through `placeDungeon`, so a
      // renumbered one still moves the level off wherever it used to be.
      if (selected && level) store.dispatch({ type: 'placeDungeon', screen: selected, level });
    },
    pickStairway: (number) => {
      if (armed === 'stairway') {
        armedStairway = number;
        syncToolbar(store.getState());
        return;
      }
      if (selected && number) store.dispatch({ type: 'placeStairway', screen: selected, number });
    },
    pickSecret: (size) => {
      if (armed === 'rupeeSecret') {
        armedSecret = size;
        syncToolbar(store.getState());
        return;
      }
      // Optional, unlike a level: the same size again takes it back off.
      patchSelected({ secret: size });
    },
    toggleBlock: (block) => {
      if (selected) store.dispatch({ type: 'toggleDungeonBlock', screen: selected, block });
    },
    toggleStock: (stock) => {
      if (selected) store.dispatch({ type: 'toggleShopStock', screen: selected, stock });
    },
    setPrice: (stock, price) => {
      // An empty box is 0, which the reducer reads as "no price recorded".
      if (selected) store.dispatch({ type: 'setShopPrice', screen: selected, stock, price });
    },
    patchNote: patchSelected,
    toggleCollected: () => {
      if (!selected) return;
      const note = store.getState().screenNotes[selected];
      if (!note?.item) return;
      store.dispatch({ type: 'collectScreen', screen: selected, collected: !note.collected });
    },
  };

  /** Draws the brushes and the screen card from the map's view state. */
  const syncToolbar = (state: TrackerState) => {
    const view: MapView = { selected, armed, armedLevel, armedStairway, armedSecret };
    brushes.render({ state, view, resolver, actions });
    screenCard.render({ state, view, resolver, interactive, actions });
  };

  // Escape lets go of the screen without having to find somewhere safe to click.
  body.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // The armed marker first: it is the state that changes what a click does,
    // so it is the one you most urgently want a way out of.
    if (armed) {
      setArmed('');
      return;
    }
    if (!selected) return;
    const cell = body.querySelector<HTMLElement>(`[data-screen="${selected}"]`);
    selectScreen(selected);
    cell?.focus();
  });

  patches.push(syncToolbar);

  /*
   * Another panel pointing at a screen: the start brush, or a dungeon number
   * in the screen card, the Levels heading or Locations — see `map-preview`.
   * The matches carry `data-previewed`, and the map dims the rest. Matched
   * from the state when the event arrives, so nothing needs redrawing. Only
   * events from inside this tracker count, so two trackers stay apart.
   */
  const applyPreview = (preview: MapPreview) => {
    const state = store.getState();
    const matches = new Set<string>();
    if (preview?.kind === 'start' && state.startScreen) matches.add(state.startScreen);
    if (preview?.kind === 'dungeon') {
      for (const [screen, mark] of Object.entries(state.marks)) {
        if (mark === 'dungeon' && state.screenNotes[screen]?.dungeon === preview.level) matches.add(screen);
      }
    }
    for (const cell of body.querySelectorAll<HTMLElement>('.z1r-screen')) {
      cell.dataset.previewed = String(matches.has(cell.dataset.screen ?? ''));
    }
    // Nothing placed yet: leave the map alone rather than dim all of it.
    body.dataset.preview = String(matches.size > 0);
  };
  document.addEventListener(MAP_PREVIEW_EVENT, (event) => {
    const tracker = body.closest('.z1r-tracker');
    if (!tracker || !(event.target instanceof Node) || !tracker.contains(event.target)) return;
    applyPreview((event as CustomEvent<MapPreview>).detail);
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
        cell.addEventListener('click', () => touchScreen(id));
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
      /*
       * A dungeon draws its level as a large numeral instead of an icon.
       *
       * The cave icon was the same on all nine and told you only "a dungeon",
       * which the numeral says too — so it was spending the middle of the cell
       * to repeat itself. The number sits left, leaving the right free for the
       * item badge, and the pair reads as "Level 5, holds the Raft" at a glance.
       */
      const numeral = el('span', 'z1r-screen-level');
      // What is known to be inside, from the location slots — see `dungeonItems`.
      const badge = el('span', 'z1r-screen-badge');
      /*
       * A warp draws its staircase big, in the bottom-left corner.
       *
       * Deliberately nothing like the dungeon numeral. That one is a bare
       * outlined figure filling the middle-left; this is a plated digit tucked
       * against a staircase. A runner glancing at the map has to tell "level 3"
       * from "warp 3" without reading either, and two numbers in the same
       * treatment would not let them.
       */
      const warp = el('span', 'z1r-screen-warp');
      /*
       * A shop draws what it sells, as a row of the items themselves.
       *
       * This used to be the two-letter codes in `detail`, which asked you to
       * translate "AR BM PO" back into arrows, bombs and a potion every time
       * you scanned the map. The sprites answer the same question without the
       * translation; the codes and the names are in the tooltip, so nothing on
       * the tile depends on recognising the art.
       */
      const stockIcons = el('span', 'z1r-screen-stock');
      /** How many stocked items did not fit — see `MAX_SHOP_ICONS`. */
      const stockMore = el('span', 'z1r-screen-stock-more');
      /*
       * The start pennant, in the top-left corner over whatever the screen is
       * marked as. The region code moves over to make room while it is there.
       */
      const pennant = el('span', 'z1r-screen-start');
      cell.append(terrain, code, slot, numeral, warp, badge, stockIcons, stockMore, detail, pennant);

      let renderedStart: boolean | null = null;
      patches.push((state) => {
        renderedStart = memoise(renderedStart, state.startScreen === id, () => {
          const isStart = state.startScreen === id;
          cell.dataset.start = String(isStart);
          if (isStart) {
            pennant.replaceChildren(createSprite(resolver, 'mark.start', { size: 14, label: 'Start' }));
          } else pennant.replaceChildren();
        });
      });

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
        const note = state.screenNotes[id];

        /*
         * An item screen draws the item, not a generic star.
         *
         * Once you know what is sitting there, the star is telling you nothing
         * you did not already know from the screen being marked at all — and
         * the map is read at a glance, where a sword reads faster than "SW".
         */
        const held = mark === 'item' && note?.item ? SCREEN_ITEMS_BY_ID.get(note.item) : undefined;
        /*
         * Whatever the location slots say is in this level. Learned from a hint
         * before the dungeon is found, or from walking in without one — either
         * way it shows here, because the two are joined by level number rather
         * than by which was recorded first.
         */
        const inside =
          mark === 'dungeon' && note?.dungeon
            ? dungeonItems(state, note.dungeon).map((id) => POOL_BY_ID.get(id)).filter(Boolean)
            : [];

        /*
         * What this shop sells, capped at what a map cell can hold.
         *
         * Three icons and three prices fill a 50x34 cell exactly; a fourth
         * column is neither a readable sprite nor a readable number. The rest
         * are counted in the corner and listed in full in the tooltip.
         */
        const stocked = mark === 'shop' ? (note?.shop ?? []).slice(0, MAX_SHOP_ICONS) : [];
        const overflow = mark === 'shop' ? (note?.shop.length ?? 0) - stocked.length : 0;
        const prices = stocked.map((stockId) => note?.shopPrices[stockId] ?? 0);

        const markKey = [
          mark,
          held?.sprite ?? '',
          inside.map((e) => e!.sprite).join(','),
          note?.dungeon ?? 0,
          // In the key because the numeral below reads it. A field this memo
          // draws from and does not key on stops redrawing when it changes.
          note?.stairway ?? 0,
          // Same rule: the stock row below is drawn from these, and a shop that
          // gains an item has to redraw.
          stocked.join(','),
          overflow,
        ].join('|');
        renderedMark = memoise(renderedMark, markKey, () => {
          cell.dataset.mark = mark;
          cell.style.setProperty('--mark-color', def?.color ?? 'transparent');

          // The big outlined numeral belongs to dungeons alone.
          numeral.textContent = mark === 'dungeon' && note?.dungeon ? String(note.dungeon) : '';

          // The warp's own corner: staircase plus which of the four it is.
          if (mark === 'stairway' && def?.sprite) {
            warp.replaceChildren(
              createSprite(resolver, def.sprite, { size: 32, label: def.name }),
              el('span', 'z1r-screen-warp-num', note?.stairway ? String(note.stairway) : ''),
            );
          } else warp.replaceChildren();

          // Those two draw their own art, and so does a shop with stock
          // recorded — none of them wants the centred one as well.
          const sprite =
            mark === 'dungeon' || mark === 'stairway' || stocked.length > 0
              ? undefined
              : (held?.sprite ?? def?.sprite);
          if (!sprite) slot.replaceChildren();
          else {
            /*
             * 18 is the nominal size at a full-width cell, not the drawn one.
             * The box itself is sized from `--map-cell-height` in the
             * stylesheet so the disc and its coloured ring track the map's
             * zoom instead of being clipped by a cell smaller than they are —
             * the same split the stock row and the warp staircase use.
             */
            slot.replaceChildren(
              createSprite(resolver, sprite, { size: 18, label: held?.name ?? def?.name }),
            );
          }

          // The stock row, one fixed-width column per item so the price line
          // below lands under the icon it belongs to.
          stockIcons.replaceChildren(
            ...stocked.map((stockId) => {
              const entry = SHOP_STOCK_BY_ID.get(stockId);
              const column = el('span', 'z1r-screen-stock-slot');
              if (entry) {
                column.append(
                  createSprite(resolver, entry.sprite, { size: 14, label: entry.name }),
                );
              }
              return column;
            }),
          );
          // A count, not an ellipsis: "how many more" is the part you would
          // otherwise have to open the tooltip to learn.
          stockMore.textContent = overflow > 0 ? `+${overflow}` : '';

          // Only the first: two icons in a 70px cell is a smudge, and the rest
          // are in the tooltip and the Locations panel.
          const first = inside[0];
          if (!first) badge.replaceChildren();
          else badge.replaceChildren(createSprite(resolver, first.sprite, { size: 16, label: first.name }));
        });
        // The coast is a fixed screen, so its notch is there from the start —
        // you can find the ledge before you can reach it.
        const isCoast = id === coastScreen(state.seed.mirroredOverworld);
        // The coast ledge is reachable the moment the Ladder is in hand — and
        // that is exactly when you have forgotten it is there.
        const coastReady = isCoast && (state.items[COAST_ITEM_REQUIRES] ?? 0) >= 1;
        // Level 9 is the one dungeon you cannot enter on sight, so its marker
        // is worth calling out the moment the last piece lands.
        const level9Ready = note?.dungeon === 9 && canEnterLevel9(state);

        const detailKey = [
          mark,
          note?.dungeon ?? 0,
          inside.map((entry) => entry!.id).join(','),
          note?.shop.join('') ?? '',
          // Every field the label is built from has to be in this key. Leaving
          // `blocks` out meant a dungeon's tags showed up in the tooltip and
          // never on the cell, because the memo saw no reason to redraw.
          note?.blocks.join('') ?? '',
          // The price line is drawn from these, so a price typed into the
          // toolbar has to reach the tile.
          prices.join(','),
          note?.spot ?? '',
          note?.item ?? '',
          note?.secret ?? '',
          isCoast,
          coastReady,
          level9Ready,
        ].join('|');
        renderedDetail = memoise(renderedDetail, detailKey, () => {
          cell.dataset.coast = String(isCoast);
          cell.dataset.coastReady = String(coastReady);
          cell.dataset.ready = String(level9Ready);
          // Reset first: every other branch writes plain text here, and a
          // leftover "prices" flag would lay that text out in columns.
          cell.dataset.shopPrices = 'false';
          detail.dataset.prices = 'false';
          detail.dataset.digits = '2';

          if (mark === 'dungeon') {
            // Just the blockers now — the numeral carries the level, so
            // repeating it here would cost the width the codes need.
            detail.textContent = (note?.blocks ?? [])
              .map((id) => DUNGEON_BLOCKS_BY_ID.get(id)?.code ?? '')
              .filter(Boolean)
              .join(' ');
          } else if (mark === 'shop') {
            /*
             * Prices under the icons, one column each, and nothing at all when
             * none is recorded — which is most shops. The stock itself is the
             * row of sprites above; repeating it here as codes would spend the
             * width the numbers need.
             */
            const shown = prices.some((price) => price > 0);
            detail.replaceChildren(
              ...(shown
                ? prices.map((price) =>
                    el('span', 'z1r-screen-price', price > 0 ? String(price) : ''),
                  )
                : []),
            );
            // The widest number decides the type size: three columns of "250"
            // at the normal size would run into each other.
            const widest = shown
              ? Math.max(...prices.map((price) => (price > 0 ? String(price).length : 0)))
              : 0;
            detail.dataset.prices = String(shown);
            detail.dataset.digits = String(Math.min(Math.max(widest, 2), 4));
            // Lifts the icon row clear of the price line, and only then.
            cell.dataset.shopPrices = String(shown);
          } else if (mark === 'item') {
            /*
             * The contents win over the name of the spot. Once you know the
             * White Sword cave holds the Raft, "RA" is what you are scanning
             * the map for; that it is the White Sword cave is in the tooltip
             * and rarely what you need at a glance.
             */
            /*
             * The sprite above already says *what* it is, so the label says
             * *where*: "CO" under a boomerang is the coast item, which is the
             * pair you are actually scanning for. Falls back to the item when
             * the spot is unnamed, and to a bare `?` when neither is known yet.
             */
            const spot = note?.spot
              ? OVERWORLD_LOCATIONS.find((l) => l.id === note.spot)?.label
              : '';
            const itemName = note?.item ? SCREEN_ITEMS_BY_ID.get(note.item)?.name : '';
            detail.textContent = shortCode(spot) || shortCode(itemName) || '?';
          } else if (mark === 'rupeeSecret') {
            // The size as one letter, the text channel for it; blank until known.
            detail.textContent = note?.secret ? (SECRET_SIZES_BY_ID.get(note.secret)?.code ?? '') : '';
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
          if (inside.length) parts.push(`holds ${inside.map((entry) => entry!.name).join(', ')}`);
          const blocked = (note?.blocks ?? [])
            .map((blockId) => DUNGEON_BLOCKS_BY_ID.get(blockId)?.name ?? blockId);
          if (blocked.length) parts.push(`blocked by ${blocked.join(', ')}`);
          if (level9Ready) parts.push('every Triforce piece held — Level 9 is open');
        } else if (mark === 'shop') {
          /*
           * Every item, not just the three the cell had room for, and the price
           * beside each one that has it. This is also the tile's non-colour,
           * non-picture channel: the names are here in words, so a shop still
           * reads without recognising a single sprite.
           */
          const recorded = note?.shopPrices ?? {};
          const stock = (note?.shop ?? []).map((s) => {
            const name = SHOP_STOCK_BY_ID.get(s)?.name ?? s;
            const price = recorded[s] ?? 0;
            return price > 0 ? `${name} ${price}` : name;
          });
          parts.push(stock.length ? `Shop: ${stock.join(', ')}` : 'Shop');
        } else if (mark === 'item') {
          const spot = note?.spot
            ? OVERWORLD_LOCATIONS.find((l) => l.id === note.spot)?.label
            : '';
          parts.push(spot || 'Item');
          parts.push(note?.item ? (SCREEN_ITEMS_BY_ID.get(note.item)?.name ?? '') : 'contents unknown');
          if (note?.item) parts.push(note.collected ? 'collected' : 'not collected');
          if (isCoast) {
            parts.push(coastReady ? 'Ladder held — reachable now' : 'needs the Ladder');
          }
        } else if (mark === 'stairway') {
          parts.push(note?.stairway ? `Warp ${note.stairway}` : 'Warp (unnumbered)');
        } else if (mark === 'rupeeSecret') {
          const size = note?.secret ? SECRET_SIZES_BY_ID.get(note.secret) : undefined;
          parts.push(size ? `${size.name} rupee secret` : 'Rupee secret (size unknown)');
        } else if (def && mark !== 'none') {
          parts.push(def.name);
        }
        if (state.startScreen === id) parts.push('start screen');
        cell.title = parts.join(' — ');
      });

      body.append(cell);
    }
  }

  return root;
}

