/**
 * The tracker view.
 *
 * Builds each panel's shell once as plain DOM and renders the panel itself as
 * React, re-rendered with the whole state on every change; the memoized cells
 * and the per-state location cache keep that cheap. See the Rendering section
 * of docs/ARCHITECTURE.md.
 */

import {
  safeStorage,
  OVERWORLD_COLUMNS,
  overworldMap,
  OVERWORLD_STAIRWAY_COUNT,
  warpRoutes,
  ROOM_ITEMS_BY_ID,
  REGIONS_BY_ID,
  SCREEN_ITEMS_BY_ID,
  ITEMS,
  labelFor,
  maxValue,
  spriteFor,
  type ItemDef,
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
import { mountHelpTip, mountPanelToggle } from './panel/mount.js';
import { mountDockItems } from './items/mount.js';
import { MAP_PREVIEW_EVENT, type MapPreview } from './map-preview.js';
import { mapsLayout } from './maps-layout.js';
import { collectDisposers, onDispose } from './shared/disposers.js';
import {
  mountMapBrushes,
  mountMapHeading,
  mountScreenCard,
  mountScreenGrid,
  type Armed,
  type MapActions,
  type MapView,
} from './overworld/mount.js';
import { memoise, runPatches, type Patch } from './patch.js';
import { buildSeedPanel } from './seed-panel.js';
import { buildLocations } from './locations.js';
import { buildHintTracker } from './hints.js';
import { buildTriforce } from './triforce.js';
import { buildRooms, createPlacement, roomItemsForInventory, type PlacementChannel } from './rooms.js';

export type TrackerSection = 'seed' | 'items' | 'dungeons' | 'locations' | 'hintlog' | 'map' | 'rooms';

export interface MountOptions {
  readonly store: Store;
  readonly resolver: SpriteResolver;
  /** `overlay` drops padding and chrome for use as an OBS browser source. */
  readonly mode?: 'full' | 'overlay';
  /**
   * false renders the seed, items, Item locations and hint log read-only, for
   * the OBS browser source, which should not be clickable.
   *
   * Only the shipped mounts are supported: the overlay, the one read-only
   * mount, never shows the map or rooms, so those two are always clickable and
   * ignore this. The Triforce panel, which only the overlay builds, is always
   * display only.
   */
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
  /**
   * Lay the Overworld and Levels out side by side or stacked as the toolbar's
   * Maps choice says (`mapsLayout`), in the page's main column. Off, the two
   * stack, which is what the desktop build has always done.
   */
  readonly mapsLayout?: boolean;
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
    mapsLayout: followMapsLayout = false,
  } = options;

  root.classList.add('z1r-tracker');
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
   * Whether the page shows Item locations beside the palette. Its columns
   * carry the Triforce pieces, so the Triforce panel is not built at all.
   */
  const piecesInLocations = palette && sections.includes('items') && sections.includes('locations');

  const builders: Record<TrackerSection, () => HTMLElement> = {
    seed: () => buildSeedPanel(store, patches, interactive),
    items: () =>
      palette
        ? buildPalette(store, resolver, patches, { itemSize, placement, placeInto })
        : buildItems(store, resolver, patches, { interactive, itemSize }),
    dungeons: () => buildTriforce(resolver, patches),
    // A column per level headed by its Triforce piece — which, in the page's
    // Items card, covers the Triforce panel as well.
    locations: () => buildLocations(store, resolver, patches, interactive, palette),
    hintlog: () => buildHintTracker(store, patches, interactive),
    // Only interactive mounts show these; the overlay's allow-list leaves them out.
    map: () => buildMap(store, resolver, patches, placement),
    rooms: () => buildRooms(store, resolver, patches, placement),
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

  /*
   * Everything this mount must undo on teardown: each panel's React root
   * registers its own unmount while the panels are built (see
   * `collectDisposers`), and the document listeners and the Maps watcher
   * are added below.
   */
  const disposers: (() => void)[] = [];
  const collect = (build: () => void) => disposers.push(...collectDisposers(build).disposers);

  const built = new Map<TrackerSection, HTMLElement>();
  collect(() => {
    for (const name of sections) {
      if (name === 'dungeons' && piecesInLocations) continue;
      // An unknown `?sections=` value must not take the whole overlay down.
      const build = builders[name];
      if (build) built.set(name, build());
    }
  });
  const items = built.get('items');
  const triforce = built.get('dungeons');

  /*
   * On the page the palette is a column of its own down the left edge, sticky
   * as the page scrolls, so it is beside whichever map you are dropping onto.
   * Item locations sits above it, a row per level, so what the palette fills
   * in is in the same column as the palette. Everything else stacks in the
   * main column in its usual order.
   */
  let main: HTMLElement | null = null;
  if (palette && items) {
    const rail = el('aside', 'z1r-rail');
    // The column's width is worked out from the tile size — see `.z1r-rail`.
    rail.style.setProperty('--z1r-item-min', items.style.getPropertyValue('--z1r-item-min'));
    const locations = built.get('locations');
    if (locations) rail.append(locations);
    rail.append(items);
    main = el('div', 'z1r-main');
    for (const [name, node] of built) if (name !== 'items' && name !== 'locations') main.append(node);
    root.dataset.rail = 'true';
    root.append(rail, main);
  } else {
    // Items and the Triforce share a row when both are shown — the triangle
    // is narrow and was leaving most of its own panel empty.
    const paired = !!items && !!triforce;
    if (paired) items.classList.add('z1r-items-panel');
    for (const [name, node] of built) {
      if (name === 'dungeons' && paired) continue;
      if (name === 'items' && paired) {
        const pair = el('div', 'z1r-pair');
        pair.append(items, triforce);
        root.append(pair);
        continue;
      }
      root.append(node);
    }
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
  /*
   * Folding is for the dock and the page, never the overlay: a browser source
   * takes no clicks, so a caret there would be furniture that cannot be used.
   */
  if (interactive) collect(() => wireCollapsing(root, defaultCollapsed));

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

  apply(store.getState());
  const unsubscribe = store.subscribe(apply);

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', onEscape, true);
    widthObserver.disconnect();
    for (const dispose of disposers) dispose();
    root.replaceChildren();
    root.classList.remove('z1r-tracker');
    // What this mount wrote on the root, so a later mount starts clean.
    for (const key of ['mode', 'compact', 'interactive', 'width', 'rail']) delete root.dataset[key];
  };
}

/* -------------------------------------------------------------------- items */

/**
 * The inventory, as the OBS dock and overlay show it.
 *
 * On the dock a click raises an item and Shift+click or a right click lowers
 * it — that grid is React, see `items/`. The overlay's is plain DOM and takes
 * no clicks. The page builds `buildPalette` in their place.
 */
function buildItems(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  opts: {
    interactive: boolean;
    itemSize: number;
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

  /*
   * The dock's grid is React — see `items/`. Same classes and attributes, so it
   * looks and hooks as it did. The overlay keeps the plain-DOM grid below: it
   * takes no clicks, and its first paint is measured synchronously for the fit.
   */
  if (opts.interactive) {
    const grid = mountDockItems(body);
    const step = (id: string, direction: 1 | -1) => store.dispatch({ type: 'cycleItem', id, direction });
    patches.push((state) =>
      grid.render({
        state,
        placedAt: placedIndex(state),
        resolver,
        itemSize: opts.itemSize,
        step,
      }),
    );
    return root;
  }

  const placedAt = new Map<string, string[]>();
  const cellOpts = { ...opts, placedAt };

  /*
   * The inventory screen's own split: always-active on top, the boxed B-slot
   * below, each labelled. The browser sources are composed by hand against a
   * stream layout, and the overlay balances each grid's columns separately.
   */
  for (const [group, caption] of [
    ['passive', 'Always active'],
    ['bslot', 'B slot'],
  ] as const) {
    const wrap = el('div', 'z1r-item-group');
    wrap.dataset.group = group;
    wrap.append(el('span', 'z1r-item-group-label', caption));
    const grid = el('div', 'z1r-item-grid');
    for (const def of ITEMS.filter((item) => item.group === group)) {
      grid.append(buildItemCell(resolver, def, cellPatches, cellOpts));
    }
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
  resolver: SpriteResolver,
  def: ItemDef,
  patches: Patch[],
  opts: {
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
  // Only the overlay draws this cell, and it takes no clicks.
  cell.disabled = true;

  /** Every room item this cell can stand for — a chain covers more than one. */
  const covers = roomItemsForInventory(def);
  cell.dataset.placeable = String(covers.length > 0);

  // The sprite is swapped wholesale on stage change, so keep a slot to swap in.
  const slot = el('span', 'z1r-item-sprite');
  const badge = el('span', 'z1r-item-badge');
  cell.append(slot, badge);

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
  root.style.setProperty('--z1r-item-min', `${itemSize + 10}px`);
  const heading = root.querySelector('.z1r-panel-title');

  /*
   * How the palette works, and what is armed, behind a ? at the end of the
   * heading rather than as a line under it, so the column spends no height on
   * instructions. On screen the armed tile's thicker ring says what is armed;
   * a hidden live region says it in words to a screen reader.
   */
  const helpHost = el('span', 'z1r-heading-helphost');
  heading?.append(helpHost);
  const help = mountHelpTip(helpHost);
  const status = el('span', 'z1r-visually-hidden');
  status.setAttribute('aria-live', 'polite');
  heading?.append(status);

  const palette = mountItemPalette(body);
  const arm = (item: string) => placement.set({ item });
  const step = (id: string, direction: 1 | -1) => store.dispatch({ type: 'cycleItem', id, direction });
  const setHeld = (id: string, value: number) => store.dispatch({ type: 'setItem', id, value });

  /*
   * A drag arms the item for as long as it is in the air, so the room sheet
   * and the map show what will take it the way they do for a right-click arm,
   * and the drop lands through the same click handlers. Dropped somewhere,
   * the landing has already put it down; dropped nowhere, whatever was armed
   * before the drag is armed again.
   */
  let beforeDrag = '';
  const dragStart = (item: string) => {
    beforeDrag = placement.get().item;
    placement.set({ item });
  };
  const dragEnd = (dropped: boolean) => {
    if (!dropped) placement.set({ item: beforeDrag });
    beforeDrag = '';
  };

  const draw = (state: TrackerState) => {
    const armed = placement.get().item;
    // Either list: the overworld-only items are not room items.
    const def = armed ? (ROOM_ITEMS_BY_ID.get(armed) ?? SCREEN_ITEMS_BY_ID.get(armed)) : undefined;
    root.dataset.armed = String(!!def);
    const armedLine = def
      ? `${def.name} armed — click ${targetFor(def.id, placeInto)}. Esc puts it down.`
      : '';
    status.textContent = armedLine;
    help.render({
      label: 'How to use Items',
      lines: [
        ...(armedLine ? [armedLine] : []),
        'Drag an item onto a room, an overworld screen, or the room card to place it.',
        'Or right-click an item to arm it, then click where you found it. Esc puts it down.',
        'Click an item to mark it held.',
      ],
    });
    palette.render({
      state,
      armed,
      placedAt: placedIndex(state),
      resolver,
      itemSize,
      placeInto,
      arm,
      setHeld,
      step,
      dragStart,
      dragEnd,
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
      onClear: () => void clearMap(),
    });
  };
  patches.push(drawHeading);

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

  /** Screens another panel is pointing at — see `applyPreview` below. */
  let previewed: ReadonlySet<string> = new Set();
  /** The warp whose routes the grid is drawing, or ''. */
  let warpFrom = '';

  /*
   * The 128 cells, drawn by React — see `overworld/ScreenGrid.tsx`. What a
   * click does stays here, with the view state it reads.
   */
  const grid = mountScreenGrid(body);
  const drawGrid = (state: TrackerState) => {
    const resolved = resolver.resolve(mapKey());
    grid.render({
      state,
      selected,
      previewed,
      warpFrom,
      // A missing or unreachable map leaves the cells blank; the codes and
      // marks carry the tracker's own information regardless.
      mapUrl: resolved.kind === 'image' ? resolved.url : '',
      resolver,
      onTouch: touchScreen,
      onClear: clearScreen,
      onCycle: cycleScreen,
      canDrop: screenCanTake,
    });
  };
  const highlightSelection = () => drawGrid(store.getState());
  /** Whether the armed item — or the one being dragged — can land on a screen. */
  const screenCanTake = () => SCREEN_ITEMS_BY_ID.has(placement.get().item);
  const clearScreen = (screen: string) => store.dispatch({ type: 'setMark', screen, mark: 'none' });
  const cycleScreen = (screen: string, direction: 1 | -1) =>
    store.dispatch({ type: 'cycleMark', screen, direction });

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
    // One find, one placement: the item is put down once it has landed, in the
    // same redraw as the edit.
    placement.settle({ item: '' }, () => {
      if (isItem && state.screenNotes[screen]?.item === item) {
        store.dispatch({ type: 'setScreenNote', screen, patch: { item: '' } });
      } else {
        // One edit, so the half-placed screen is never saved or broadcast.
        store.dispatch({ type: 'markScreen', screen, mark: 'item', patch: { item } });
      }
      return store.getState() !== state;
    });
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
      // The size goes on in the same edit as the mark.
      const patch = armed === 'rupeeSecret' && armedSecret ? { secret: armedSecret } : {};
      store.dispatch({ type: 'markScreen', screen, mark: armed, patch });
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
    setPrice: (screen, stock, price) => {
      // An empty box is 0, which the reducer reads as "no price recorded".
      if (screen) store.dispatch({ type: 'setShopPrice', screen, stock, price });
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
    screenCard.render({ state, view, resolver, actions });
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
  patches.push(drawGrid);
  // The store's pass also carries a brush put down by `placement.settle`.
  patches.push(() => syncArming());

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
    // A warp: itself and the warps its three staircases lead to. The guides
    // between them are drawn by the grid — see `warpFrom`.
    warpFrom = preview?.kind === 'warp' ? preview.screen : '';
    if (preview?.kind === 'warp') {
      const route = warpRoutes(state).find((r) => r.screen === preview.screen);
      if (route) {
        matches.add(preview.screen);
        for (const exit of route.exits) if (exit.screen) matches.add(exit.screen);
      }
    }
    if (preview?.kind === 'dungeon') {
      for (const [screen, mark] of Object.entries(state.marks)) {
        if (mark === 'dungeon' && state.screenNotes[screen]?.dungeon === preview.level) matches.add(screen);
      }
    }
    previewed = matches;
    // Nothing placed yet: leave the map alone rather than dim all of it.
    body.dataset.preview = String(matches.size > 0);
    drawGrid(state);
  };
  const onPreview = (event: Event) => {
    const tracker = body.closest('.z1r-tracker');
    if (!tracker || !(event.target instanceof Node) || !tracker.contains(event.target)) return;
    applyPreview((event as CustomEvent<MapPreview>).detail);
  };
  document.addEventListener(MAP_PREVIEW_EVENT, onPreview);
  // On the document, so it outlives this panel unless the mount takes it off.
  onDispose(() => document.removeEventListener(MAP_PREVIEW_EVENT, onPreview));

  return root;
}
