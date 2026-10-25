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
  COAST_SPOT_ID,
  DUNGEON_BLOCKS,
  DUNGEON_BLOCKS_BY_ID,
  DUNGEONS,
  deriveItemLocations,
  OVERWORLD_LOCATIONS,
  MARKS,
  MARKS_BY_KIND,
  OVERWORLD_COLUMNS,
  OVERWORLD_ROWS,
  MINOR_DROPS,
  OVERWORLD_EXTRAS,
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

const DEFAULT_SECTIONS: readonly TrackerSection[] = [
  'seed',
  'items',
  'dungeons',
  'locations',
  'hintlog',
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
    locations: () => buildLocations(store, resolver, patches, interactive, compact),
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
    // An unknown `?sections=` value must not take the whole overlay down.
    const build = builders[name];
    if (build) built.set(name, build());
  }
  const items = built.get('items');
  const triforce = built.get('dungeons');
  const locations = built.get('locations');

  /*
   * On the page, the palette's card also holds Item locations and the
   * Triforce: the palette wraps on the left, the other two sit to its right.
   *
   * They are what the palette's placements fill in, so they read as one tool
   * rather than three panels. Each keeps its own heading and fold; folding
   * Items folds the lot, because the card is one child of the Items panel and
   * a folded panel hides everything but its title.
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
 * Where each room item has been recorded, as item id -> places.
 *
 * Every cell wants "is this spoken for, and where", and there are up to two
 * dozen of them. Rebuilt once per pass rather than walked per cell.
 *
 * Three sources, because an item can be written down in three places: a room
 * on a level map, an item screen on the overworld, and — for a save from before
 * the maps filled the item locations — a location slot itself. All three land
 * in one index, so a cell's corner tick means the same thing wherever the item
 * was recorded.
 */
function placedIndex(state: TrackerState): Map<string, string[]> {
  const placedAt = new Map<string, string[]>();
  const record = (item: string, where: string) => {
    const seen = placedAt.get(item);
    if (seen) seen.push(where);
    else placedAt.set(item, [where]);
  };
  for (const [level, rooms] of Object.entries(state.rooms)) {
    for (const [room, note] of Object.entries(rooms)) {
      if (note.item) record(note.item, `L${level} ${room}`);
    }
  }
  for (const [screen, note] of Object.entries(state.screenNotes)) {
    // The map draws an item only on an item screen, so only those count.
    if (!note.item || state.marks[screen] !== 'item') continue;
    const spot = note.spot ? OVERWORLD_LOCATIONS.find((l) => l.id === note.spot)?.label : '';
    record(note.item, spot ? `${spot} (${screen})` : screen);
  }
  for (const { location, placement } of deriveItemLocations(state).slots) {
    if (placement?.source.kind === 'stored' && placement.item) {
      record(placement.item, location.label);
    }
  }
  return placedAt;
}

/** Each place this item has been recorded in, phrased for a tooltip. */
function placedSuffix(ids: readonly string[], placedAt: Map<string, string[]>): string {
  const parts: string[] = [];
  for (const id of ids) {
    const where = placedAt.get(id);
    if (!where?.length) continue;
    const name = ROOM_ITEMS_BY_ID.get(id)?.name ?? id;
    parts.push(`${name} at ${where.join(', ')}`);
  }
  return parts.length ? ` — placed: ${parts.join('; ')}` : '';
}

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

/** The palette's Held group, in this order. */
const HELD_GROUP: readonly string[] = ['book', 'magicalShield', 'ladder', 'raft', 'bracelet'];

/**
 * The Items panel on the page: an always-on placement palette.
 *
 * A click arms an item; the next click on a room or an overworld screen puts
 * it there. There is no mode to switch on first, and the item stays armed
 * after it lands, so a run of placements costs one pick. Clicking the armed
 * item again, or Escape, puts it down.
 *
 * One cell per thing that can be placed — the shuffle pool, then the Map, the
 * Compass and a Triforce piece, then the five overworld-only items — rather
 * than one per inventory item. A chain
 * such as the sword is one inventory cell but two pool entries, and the White
 * and the Magical Sword can be found in either order; a single cell could only
 * ever offer the next one up.
 *
 * Held is still read from the inventory, exactly as the inventory panel reads
 * it, and collecting a placement is what raises it. The right button is how an
 * item with no placement becomes held — what you start with or buy: a right
 * click raises its inventory stage by one and Shift+right click lowers it, the
 * stage logic the left button used to carry.
 *
 * The passive items you carry — Book, Shield, Ladder, Raft, Power Bracelet —
 * have a captioned group of their own. Bombs close the first group: a minor
 * drop, placeable in a room or on a screen but filling no location slot.
 *
 * The overworld-only items — the Wooden Sword, the Blue Candle, both potions,
 * the Letter and Meat — are never in the shuffle, so they land on a screen and
 * not in a room, and their caption says so.
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
  const { placement, placeInto } = opts;
  const { root, body } = section('Items', 'z1r-palette');
  root.classList.add('z1r-palette-panel');
  root.style.setProperty('--z1r-item-min', `${opts.itemSize + 10}px`);
  const heading = root.querySelector('.z1r-panel-title');

  /** Where an item can be dropped in this mount, in words, or '' for nowhere. */
  const targetFor = (id: string): string => {
    // Rooms hold the pool and the dungeon pickups; the overworld holds the pool
    // and the overworld-only items. A Map has no business on a screen, and a
    // Letter none in a dungeon.
    const rooms = placeInto.rooms && ROOM_ITEMS_BY_ID.has(id);
    const map = placeInto.map && SCREEN_ITEMS_BY_ID.has(id);
    if (rooms && map) return 'a room or an overworld screen';
    if (rooms) return 'a room';
    if (map) return 'an overworld screen';
    return '';
  };

  /*
   * One line saying what the next click does.
   *
   * In the heading rather than under the grid, so the panel is no taller for
   * it, and in words — the armed cell's ring is the other channel.
   */
  const status = el('span', 'z1r-palette-status');
  status.setAttribute('aria-live', 'polite');
  heading?.append(status);

  const placedAt = new Map<string, string[]>();
  const cellPatches: Patch[] = [];

  const stepItem = (itemId: string, direction: 1 | -1) =>
    store.dispatch({ type: 'cycleItem', id: itemId, direction });

  /** Raise or lower from the right button, or from the arrow keys. */
  const wireStage = (cell: HTMLElement, itemId: string | undefined) => {
    cell.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (itemId) stepItem(itemId, event.shiftKey ? -1 : 1);
    });
    if (!itemId) return;
    // The keyboard's way to the same two steps, since Enter and Space arm.
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        stepItem(itemId, 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        stepItem(itemId, -1);
      }
    });
  };

  const placeableCell = (def: RoomItemDef): HTMLElement => {
    const pool = SCREEN_ITEMS_BY_ID.get(def.id);
    /*
     * The inventory item this entry raises, if any. The Heart Container's is
     * empty — the running total is on the game's own HUD — and the Map, the
     * Compass and a Triforce piece have no pool entry at all, so those four
     * have no held state to show.
     */
    const inventory = pool?.itemId ? ITEMS_BY_ID.get(pool.itemId) : undefined;
    const target = targetFor(def.id);

    const cell = el('button', inventory ? 'z1r-item' : 'z1r-item z1r-item-dungeon');
    cell.type = 'button';
    cell.dataset.item = def.id;
    cell.dataset.group = pool ? 'pool' : 'dungeon';
    cell.dataset.placeable = String(!!target);
    cell.dataset.armed = 'false';
    cell.dataset.placed = 'false';
    cell.append(createSprite(resolver, def.sprite, { size: opts.itemSize, label: '' }));

    cell.addEventListener('click', () => {
      if (!target) return;
      // A toggle, so the same click both picks an item up and puts it down.
      placement.set({ item: placement.get().item === def.id ? '' : def.id });
    });
    wireStage(cell, inventory?.id);

    cellPatches.push((state) => {
      const armed = placement.get().item === def.id;
      cell.dataset.armed = String(armed);
      const where = placedSuffix([def.id], placedAt);
      cell.dataset.placed = String(!!where);

      let heldText = '';
      let stageHint = '';
      if (inventory && pool) {
        const value = state.items[inventory.id] ?? 0;
        const held = value >= pool.value;
        cell.dataset.owned = String(held);
        cell.dataset.held = String(held);
        heldText = held ? ' — held' : ' — not held';
        // A chain's lower stages are not pool entries, so say which stage the
        // inventory is at when it is not this one.
        const stage = value > 0 ? labelFor(inventory, value) : '';
        if (stage && stage !== def.name) heldText += ` (${inventory.name}: ${stage})`;
        stageHint = `; right-click raises ${inventory.name}, Shift+right-click lowers it`;
      }
      const action = target
        ? ` — click to ${armed ? 'put down' : `arm for ${target}`}`
        : ' — nowhere in this window to place it';
      cell.title = `${def.name}${heldText}${where}${action}${stageHint}`;
      cell.setAttribute('aria-pressed', String(armed));
      cell.setAttribute('aria-label', cell.title);
    });

    return cell;
  };

  const inventoryOnlyCell = (def: ItemDef): HTMLElement => {
    const cell = el('button', 'z1r-item');
    cell.type = 'button';
    cell.dataset.itemId = def.id;
    cell.dataset.item = def.id;
    cell.dataset.group = 'inventory';
    cell.dataset.placeable = 'false';
    cell.dataset.armed = 'false';
    const slot = el('span', 'z1r-item-sprite');
    const badge = el('span', 'z1r-item-badge');
    cell.append(slot, badge);
    wireStage(cell, def.id);

    let renderedSprite: string | null = null;
    cellPatches.push((state) => {
      const value = state.items[def.id] ?? 0;
      const key = spriteFor(def, value);
      renderedSprite = memoise(renderedSprite, key, () => {
        slot.replaceChildren(createSprite(resolver, key, { size: opts.itemSize }));
      });
      cell.dataset.owned = String(value > 0);
      cell.dataset.held = String(value > 0);
      const held = labelFor(def, value);
      cell.title =
        `${held} — ${value > 0 ? 'held' : 'not held'} — never placed, so not armable;` +
        ' right-click raises, Shift+right-click lowers';
      cell.setAttribute('aria-pressed', String(value > 0));
      cell.setAttribute('aria-label', cell.title);
      if (def.kind === 'progressive' && value > 0 && maxValue(def) > 1) {
        badge.textContent = String(value);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    });

    return cell;
  };

  const group = (name: string, caption?: string) => {
    const wrap = el('div', 'z1r-palette-group');
    wrap.dataset.group = name;
    if (caption) wrap.append(el('span', 'z1r-item-group-label', caption));
    const cells = el('div', 'z1r-palette-cells');
    wrap.append(cells);
    body.append(wrap);
    return cells;
  };

  const poolCells = group('pool');
  for (const def of ROOM_ITEMS.filter(
    (e) => POOL_BY_ID.has(e.id) && !HELD_GROUP.includes(e.id) && e.id !== 'heart',
  )) {
    poolCells.append(placeableCell(def));
  }
  for (const def of MINOR_DROPS) poolCells.append(placeableCell(def));
  const heldCells = group('held', 'Held');
  for (const id of HELD_GROUP) {
    const def = ROOM_ITEMS_BY_ID.get(id);
    if (def) heldCells.append(placeableCell(def));
  }
  // The Heart Container leads the dungeon pickups: it is a level's own drop far
  // more often than anything else, and four here split evenly into two rows.
  const dungeonCells = group('dungeon');
  const heartDef = ROOM_ITEMS_BY_ID.get('heart');
  if (heartDef) dungeonCells.append(placeableCell(heartDef));
  for (const def of ROOM_ITEMS.filter((entry) => !SCREEN_ITEMS_BY_ID.has(entry.id))) {
    dungeonCells.append(placeableCell(def));
  }
  const overworldCells = group('overworld', 'Overworld only');
  for (const def of OVERWORLD_EXTRAS) {
    overworldCells.append(placeableCell(def));
  }
  // Every inventory item can be placed now, so this group is normally absent;
  // it stays for any item added to the inventory before it has a placement.
  const placedSomewhere = (item: ItemDef) => SCREEN_ITEMS.some((e) => e.itemId === item.id);
  const unplaced = ITEMS.filter((item) => !placedSomewhere(item));
  if (unplaced.length) {
    const inventoryCells = group('inventory', 'Mark held');
    for (const def of unplaced) inventoryCells.append(inventoryOnlyCell(def));
  }

  /*
   * Wrap evenly, never lopsided.
   *
   * Every group takes the same number of rows — the fewest that keep all of
   * them on one line at this width — and each row of a group is the same
   * length, so a short last row is centered under the others rather than
   * hanging off the left. `--cols` sizes each group's box to whole cells; the
   * stylesheet centers what does not fill it.
   */
  const cellGroups = [...body.querySelectorAll<HTMLElement>('.z1r-palette-cells')];
  const setRows = (rows: number) => {
    for (const cells of cellGroups) {
      cells.style.setProperty('--cols', String(Math.max(1, Math.ceil(cells.childElementCount / rows))));
    }
  };
  setRows(1);
  let balancedWidth = -1;

  /*
   * The width a given row count needs, worked out rather than measured.
   *
   * Laying the groups out at each count and reading back where they landed
   * proved unreliable on the first pass, before the card had settled. The
   * sizes involved are all fixed — a cell, the gap between cells, the rule
   * between groups, and a caption no group may be narrower than — so the sum
   * is exact and needs no layout.
   */
  const widthFor = (rows: number): number => {
    const cell = body.querySelector<HTMLElement>('.z1r-item')?.offsetWidth ?? 0;
    let total = 0;
    for (const cells of cellGroups) {
      const group = cells.parentElement;
      if (!group) continue;
      const cols = Math.max(1, Math.ceil(cells.childElementCount / rows));
      const gap = parseFloat(getComputedStyle(cells).columnGap) || 0;
      const caption = group.querySelector<HTMLElement>('.z1r-item-group-label')?.scrollWidth ?? 0;
      const style = getComputedStyle(group);
      total +=
        Math.max(cols * cell + (cols - 1) * gap, caption) +
        (parseFloat(style.marginInlineStart) || 0) +
        (parseFloat(style.paddingInlineStart) || 0) +
        (parseFloat(style.borderInlineStartWidth) || 0);
    }
    return total;
  };

  const balance = () => {
    const width = body.clientWidth;
    // Folded away, or not laid out yet; and a height-only change is the
    // balancing itself settling, which needs no second pass.
    if (!width || width === balancedWidth) return;
    balancedWidth = width;
    const most = Math.max(...cellGroups.map((cells) => cells.childElementCount));
    let rows = 1;
    while (rows < most && widthFor(rows) > width) rows++;
    setRows(rows);
  };
  /*
   * Held by the patch list below rather than created and dropped: an observer
   * nothing references can be collected, and then the palette quietly stops
   * re-wrapping when the window changes size.
   */
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(balance) : null;
  observer?.observe(body);
  // The first pass, once the card has put this where it will live.
  requestAnimationFrame(balance);

  const own: Patch[] = [
    (state) => {
      placedAt.clear();
      for (const [item, where] of placedIndex(state)) placedAt.set(item, where);
    },
    (state) => runPatches(cellPatches, state),
    () => {
      const armed = placement.get().item;
      // Either list: the overworld-only items are not room items.
      const def = armed ? (ROOM_ITEMS_BY_ID.get(armed) ?? SCREEN_ITEMS_BY_ID.get(armed)) : undefined;
      root.dataset.armed = String(!!def);
      status.textContent = def
        ? `${def.name} armed — click ${targetFor(def.id)}. Esc puts it down.`
        : 'Click an item to place it. Right-click marks it held.';
    },
    // Without ResizeObserver, re-wrap on each redraw instead; with one, this is
    // also what keeps the observer referenced.
    () => {
      if (!observer) balance();
    },
  ];

  patches.push((state) => runPatches(own, state));
  // Arming changes nothing in the store, so the channel drives its own redraw.
  placement.watch(() => runPatches(own, store.getState()));

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
   * How many of the four warp staircases have been found.
   *
   * A stairway cell says which of the four it is; what it cannot say is how
   * many are still missing, and a map with a hundred marks on it does not
   * answer that by being looked at. Counted from the marks rather than from the
   * numbers, so a stairway cycled onto a tile without one still counts, and not
   * capped: a fifth shows as 5/4 rather than being refused.
   *
   * Ahead of the Clear button, whose `margin-inline-start: auto` keeps it at
   * the far end regardless of what sits before it.
   */
  const stairCount = el('span', 'z1r-map-stairs');
  stairCount.title = 'Warp staircases marked, out of the four a seed has';
  heading?.append(stairCount);
  patches.push((state) => {
    const found = Object.values(state.marks).filter((mark) => mark === 'stairway').length;
    stairCount.textContent = `Warps ${found}/${OVERWORLD_STAIRWAY_COUNT}`;
  });

  /*
   * Clear every mark in one go.
   *
   * A finished run leaves most of 128 screens marked and none of it carries
   * into the next seed. Unmarking them by hand is a chore nobody does, so the
   * map ends up starting a seed with the last one still on it.
   *
   * Confirmed, because it is a lot of work to lose to a misclick, and scoped to
   * the map alone — items and the Triforce have their own controls, and wiping
   * those here would make this a second Reset wearing a friendlier label.
   */
  if (interactive) {
    const clear = el('button', 'z1r-chip-button z1r-map-clear', 'Clear');
    clear.type = 'button';
    clear.title = 'Remove every mark from the map. Items and Triforce are untouched.';
    clear.addEventListener('click', () => {
      const state = store.getState();
      const marked = Object.keys(state.marks).length;
      if (marked === 0) return;
      const ok = globalThis.confirm?.(
        `Clear all ${marked} marked screens? Items and Triforce are not affected.`,
      );
      if (ok !== false) store.dispatch({ type: 'clearMap' });
    });
    heading?.append(clear);
  }

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

  /*
   * Which staircase in a warp room takes you where.
   *
   * The routing is fixed — see `warpRoutes` — so this is not a thing the player
   * records, it is a thing they should not have to hold in their head. What
   * they want mid-run is "I am standing in warp 3 and I want to get to the
   * screen with Level 6 on it", and the answer is a staircase, not a number.
   *
   * Screens fill in as the four get marked, and each row stays put whether or
   * not its warp is found yet, so the shape of the table does not move around
   * under a player who has learned where to look on it.
   */
  const routes = el('div', 'z1r-warp-routes');
  const routeRows = warpRoutes(store.getState()).map((route) => {
    const row = el('div', 'z1r-warp-route');
    const from = el('span', 'z1r-warp-route-from', String(route.warp));
    const at = el('span', 'z1r-warp-route-at');
    row.append(from, at);
    const exits = route.exits.map((exit) => {
      // The staircase's initial, then where it lands. Written out rather than
      // drawn, because "left" is a position in a room and no icon says that
      // better than the word does.
      const cell = el('span', 'z1r-warp-route-exit');
      cell.append(
        el('b', 'z1r-warp-route-side', exit.position[0]?.toUpperCase() ?? ''),
        el('span', 'z1r-warp-route-to', String(exit.warp)),
        el('span', 'z1r-warp-route-screen'),
      );
      return cell;
    });
    row.append(...exits);
    routes.append(row);
    return { row, at, exits };
  });
  root.insertBefore(routes, body);
  patches.push((state) => {
    const model = warpRoutes(state);
    for (const [index, entry] of routeRows.entries()) {
      const route = model[index];
      if (!route) continue;
      entry.at.textContent = route.screen ?? '—';
      entry.row.dataset.found = String(!!route.screen);
      for (const [slot, exit] of route.exits.entries()) {
        const cell = entry.exits[slot];
        const screen = cell?.querySelector('.z1r-warp-route-screen');
        if (screen) screen.textContent = exit.screen ?? '—';
        cell?.setAttribute(
          'title',
          `From warp ${route.warp}, the ${exit.position} staircase comes out at warp ${exit.warp}` +
            (exit.screen ? ` on ${exit.screen}` : ', which is not marked yet'),
        );
      }
    }
  });

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
  let armed: MarkKind | 'start' | '' = '';
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
   * again lifts it, the way a room does, and the item stays armed either way.
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

  const setArmed = (kind: MarkKind | 'start' | '') => {
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

  const kindRow = el('div', 'z1r-tool-row z1r-tool-kinds');
  toolbar.append(kindRow);
  const kindButtons: HTMLButtonElement[] = [];

  /** Detail rows appear only for the mark the selected screen carries. */
  const detailRows: { row: HTMLElement; forKind: MarkKind }[] = [];
  const detailRow = (forKind: MarkKind, label: string) => {
    const row = el('div', 'z1r-tool-row z1r-tool-detail');
    // Labelled for screen readers rather than on screen. Only one detail row is
    // ever visible, and which one is already answered by the mark.
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label);
    toolbar.append(row);
    detailRows.push({ row, forKind });
    return row;
  };

  /** Names the screen being edited, so the toolbar is never ambiguous. */
  const target = el('span', 'z1r-tool-target');
  kindRow.append(target);

  const syncToolbar = (state: TrackerState) => {
    const mark = selected ? (state.marks[selected] ?? 'none') : 'none';
    const note = selected ? state.screenNotes[selected] : undefined;

    toolbar.dataset.active = String(!!selected || !!armed);
    const armedName =
      armed === 'start' ? 'the start' : armed ? MARKS_BY_KIND.get(armed)?.name : '';
    // Two markers are placed by number and neither can be stamped without one.
    const needsLevel = armed === 'dungeon' && !armedLevel;
    const needsStairway = armed === 'stairway' && !armedStairway;
    const placing =
      armed === 'dungeon'
        ? `Level ${armedLevel}`
        : armed === 'stairway'
          ? `Warp ${armedStairway}`
          : armed === 'rupeeSecret' && armedSecret
            ? `${SECRET_SIZES_BY_ID.get(armedSecret)?.name ?? ''} rupee secret`
            : armedName;
    // Says what the next click does, in the order the toolbar reads: pick the
    // marker, pick the number, then place it.
    target.textContent = needsLevel
      ? 'Pick a level'
      : needsStairway
        ? 'Pick a warp'
        : armed
          ? `Placing ${placing}`
          : selected || 'Pick a screen';
    toolbar.dataset.waiting = String(needsLevel || needsStairway);

    // The pennant is not a mark, so "already this" means "is the start".
    startButton.dataset.active = String(!!selected && state.startScreen === selected);
    startButton.dataset.armed = String(armed === 'start');
    startButton.setAttribute(
      'aria-pressed',
      String(armed === 'start' || (!!selected && state.startScreen === selected)),
    );

    for (const button of kindButtons) {
      const kind = button.dataset.mark as MarkKind;
      /*
       * Two states, kept apart on purpose. `active` is "the selected tile is
       * already this", `armed` is "the next tile you click becomes this".
       * Conflating them would make the toolbar unable to say whether a click
       * is about to change anything.
       */
      const active = !!selected && kind === mark;
      button.dataset.active = String(active);
      button.dataset.armed = String(armed === kind);
      button.setAttribute('aria-pressed', String(armed === kind || active));
      // Never disabled now: with nothing selected the buttons still arm, which
      // is how a palette is supposed to work.
      button.disabled = false;
    }
    // Shown for whichever the toolbar is describing: the marker being armed, or
    // the tile being edited.
    const showing = armed || (selected ? mark : '');
    for (const { row, forKind } of detailRows) row.hidden = forKind !== showing;
    for (const control of [spotSelect, itemSelect]) control.disabled = !selected && !armed;

    for (const button of levelButtons) {
      // While arming, the buttons show what is about to be placed; otherwise
      // they show what the selected tile already is.
      const shown = armed === 'dungeon' ? armedLevel : (note?.dungeon ?? 0);
      button.dataset.active = String(Number(button.dataset.level) === shown);
    }
    for (const button of stairwayButtons) {
      const shown = armed === 'stairway' ? armedStairway : (note?.stairway ?? 0);
      button.dataset.active = String(Number(button.dataset.stairway) === shown);
    }
    for (const button of secretButtons) {
      const shown = armed === 'rupeeSecret' ? armedSecret : (note?.secret ?? '');
      button.dataset.active = String(button.dataset.secret === shown);
    }
    for (const button of stockButtons) {
      button.dataset.active = String(!!note?.shop.includes(button.dataset.stock ?? ''));
    }
    for (const input of stockPriceInputs) {
      const id = input.dataset.stock ?? '';
      const stocked = !!note?.shop.includes(id);
      // Disabled rather than hidden: the boxes keep their places under the
      // toggles, so the row does not reflow every time an item is ticked.
      input.disabled = !stocked || !interactive;
      const recorded = note?.shopPrices[id] ?? 0;
      // Never overwritten mid-edit, or typing fights the patch loop.
      if (document.activeElement !== input) input.value = recorded ? String(recorded) : '';
    }
    for (const button of blockButtons) {
      button.dataset.active = String(!!note?.blocks.includes(button.dataset.block ?? ''));
    }
    if (document.activeElement !== spotSelect) spotSelect.value = note?.spot ?? '';
    if (document.activeElement !== itemSelect) itemSelect.value = note?.item ?? '';

    const placed = note?.item ? SCREEN_ITEMS_BY_ID.get(note.item) : undefined;
    const got = !!placed && !!note?.collected;
    collectedToggle.disabled = !interactive || !selected || !placed;
    collectedToggle.dataset.on = String(got);
    collectedToggle.setAttribute('aria-pressed', String(got));
    const label = got ? '✓ Collected' : 'Collected';
    if (collectedToggle.textContent !== label) collectedToggle.textContent = label;
    collectedToggle.title = placed
      ? got
        ? `Mark ${placed.name} not picked up. The inventory keeps what collecting gave it.`
        : `Mark ${placed.name} picked up, which marks it held`
      : 'Nothing on this screen to collect';
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
     * is seven buttons that never change, so it is learned in one glance and
     * then only costs space. Selection is still shown by fill *and* by an
     * outline, so it is not carried by colour.
     */
    button.title =
      mark.kind === 'none'
        ? 'Clear screens. Click again to stop.'
        : `Place ${mark.name}. Click again to stop.`;
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', () => {
      /*
       * Arming only. This used to also stamp the selected tile, which made the
       * button do two different things depending on invisible state and was
       * impossible to explain. One job: choose what you are about to place.
       */
      setArmed(armed === mark.kind ? '' : mark.kind);
    });
    kindButtons.push(button);
    kindRow.append(button);
  }

  /*
   * The start pennant, after the marks and set apart from them.
   *
   * Not a mark: there is one per map, and the screen it goes on usually has a
   * cave of its own that still wants marking. So it arms like a marker but
   * draws in a corner of the tile, over whatever the screen already is.
   */
  const startButton = el('button', 'z1r-tool-mark z1r-tool-start');
  startButton.type = 'button';
  startButton.dataset.mark = 'start';
  startButton.append(createSprite(resolver, 'mark.start', { size: 18, label: 'Start' }));
  startButton.title = 'Place the start screen. One per map. Click again to stop.';
  startButton.setAttribute('aria-label', startButton.title);
  startButton.addEventListener('click', () => setArmed(armed === 'start' ? '' : 'start'));
  kindRow.append(startButton);

  /*
   * Which level this is. 1-9 only.
   *
   * There used to be a `?` for "found but not identified". There is no such
   * state in practice: the level number is painted on the wall of the entrance,
   * so anyone marking a dungeon already knows which one it is.
   */
  const levelRow = detailRow('dungeon', 'Level');
  const levelButtons: HTMLButtonElement[] = [];
  for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const button = el('button', 'z1r-mark-level', String(level));
    button.type = 'button';
    button.dataset.level = String(level);
    button.title = `Level ${level}`;
    button.addEventListener('click', () => {
      if (armed === 'dungeon') {
        // Arming half of the flow: marker, then number, then click the map.
        armedLevel = armedLevel === level ? 0 : level;
        syncToolbar(store.getState());
        return;
      }
      // Editing a tile already on the map. Goes through `placeDungeon` too, so
      // renumbering one still moves the level off wherever it used to be.
      if (selected) store.dispatch({ type: 'placeDungeon', screen: selected, level });
    });
    levelButtons.push(button);
    levelRow.append(button);
  }

  /*
   * What turned you back last time.
   *
   * The question this answers is "can I finish that one yet?", asked from the
   * overworld with a new item in hand — and without it the only way to find out
   * is to walk back in. Same row as the level, because you learn both on the
   * same trip.
   */
  const blockRow = detailRow('dungeon', 'Blocked by');
  const blockButtons: HTMLButtonElement[] = [];
  for (const block of DUNGEON_BLOCKS) {
    const button = el('button', 'z1r-mark-stock-option');
    button.type = 'button';
    button.dataset.block = block.id;
    button.title = block.name;
    button.setAttribute('aria-label', block.name);
    button.append(createSprite(resolver, block.sprite, { size: 18, label: block.name }));
    button.addEventListener('click', () => {
      if (selected) store.dispatch({ type: 'toggleDungeonBlock', screen: selected, block: block.id });
    });
    blockButtons.push(button);
    blockRow.append(button);
  }

  /*
   * Which of the four warp staircases this is.
   *
   * The same shape as the level row, for the same reason: the four are
   * identical to look at, so the number is the whole of what there is to record
   * about one, and a stairway cannot be placed without it.
   */
  const stairwayRow = detailRow('stairway', 'Warp');
  const stairwayButtons: HTMLButtonElement[] = [];
  for (let stairway = 1; stairway <= OVERWORLD_STAIRWAY_COUNT; stairway++) {
    const button = el('button', 'z1r-mark-level', String(stairway));
    button.type = 'button';
    button.dataset.stairway = String(stairway);
    button.title = `Warp ${stairway}`;
    button.addEventListener('click', () => {
      if (armed === 'stairway') {
        // Arming half of the flow: marker, then number, then click the map.
        armedStairway = armedStairway === stairway ? 0 : stairway;
        syncToolbar(store.getState());
        return;
      }
      // Editing a tile already on the map. Goes through `placeStairway` too, so
      // renumbering one still moves the number off wherever it used to be.
      if (selected) {
        store.dispatch({ type: 'placeStairway', screen: selected, number: stairway });
      }
    });
    stairwayButtons.push(button);
    stairwayRow.append(button);
  }

  /*
   * How big a rupee secret is.
   *
   * Optional, unlike a level or a warp number: the mark alone already says
   * "money here", and the size is only known once you have walked in. A
   * second click on the active size takes it back off.
   */
  const secretRow = detailRow('rupeeSecret', 'Size');
  const secretButtons: HTMLButtonElement[] = [];
  for (const size of SECRET_SIZES) {
    const button = el('button', 'z1r-mark-level', size.code);
    button.type = 'button';
    button.dataset.secret = size.id;
    button.title = `${size.name} — ${size.range} rupees when shop items are shuffled`;
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', () => {
      if (armed === 'rupeeSecret') {
        armedSecret = armedSecret === size.id ? '' : size.id;
        syncToolbar(store.getState());
        return;
      }
      if (!selected) return;
      const current = store.getState().screenNotes[selected]?.secret ?? '';
      patchSelected({ secret: current === size.id ? '' : size.id });
    });
    secretButtons.push(button);
    secretRow.append(button);
  }

  /*
   * What the shop sells, and for how much.
   *
   * Multi-select, since most sell more than one thing. The price box under each
   * toggle is optional everywhere — the question the map answers is still "did
   * I see arrows anywhere", and a price is only worth typing for the ones you
   * are saving up for. It stays disabled until the item is ticked, so the box
   * can never hold a number for something this shop does not stock.
   */
  const stockRow = detailRow('shop', 'Sells');
  const stockButtons: HTMLButtonElement[] = [];
  const stockPriceInputs: HTMLInputElement[] = [];
  for (const stock of SHOP_STOCK) {
    const group = el('div', 'z1r-mark-stock');
    const button = el('button', 'z1r-mark-stock-option');
    button.type = 'button';
    button.dataset.stock = stock.id;
    button.title = stock.name;
    button.setAttribute('aria-label', stock.name);
    button.append(createSprite(resolver, stock.sprite, { size: 18, label: stock.name }));
    button.addEventListener('click', () => {
      if (selected) store.dispatch({ type: 'toggleShopStock', screen: selected, stock: stock.id });
    });

    const price = document.createElement('input');
    price.type = 'number';
    price.className = 'z1r-input z1r-mark-stock-price';
    price.dataset.stock = stock.id;
    price.min = '0';
    price.step = '1';
    price.placeholder = '–';
    // Named per item: the row is eight identical-looking boxes, so "Price"
    // alone would leave a screen reader unable to say which one it is on.
    price.title = `Price of ${stock.name}`;
    price.setAttribute('aria-label', `Price of ${stock.name}`);
    price.addEventListener('input', () => {
      if (!selected) return;
      // An empty box is 0, which the reducer reads as "no price recorded" and
      // deletes. Clearing the field is how you take a price back.
      store.dispatch({
        type: 'setShopPrice',
        screen: selected,
        stock: stock.id,
        price: Number(price.value),
      });
    });

    stockButtons.push(button);
    stockPriceInputs.push(price);
    group.append(button, price);
    stockRow.append(group);
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
  spotSelect.addEventListener('change', () => patchSelected({ spot: spotSelect.value }));

  const itemSelect = document.createElement('select');
  itemSelect.className = 'z1r-input z1r-tool-select';
  itemSelect.title = 'Which item is in it';
  const unknownItem = document.createElement('option');
  unknownItem.value = '';
  unknownItem.textContent = 'Item unknown';
  itemSelect.append(unknownItem);
  for (const entry of SCREEN_ITEMS) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    itemSelect.append(option);
  }
  itemSelect.addEventListener('change', () => patchSelected({ item: itemSelect.value }));

  /*
   * Picked up, or only seen.
   *
   * The one gesture that grants a screen's item, beside the item it is about.
   * A check mark in the label is the state's non-colour channel; the dashed
   * ring the pressed chip also draws is a shape, not a hue.
   */
  const collectedToggle = el('button', 'z1r-chip-button z1r-tool-collected', 'Collected');
  collectedToggle.type = 'button';
  collectedToggle.addEventListener('click', () => {
    if (!selected) return;
    const note = store.getState().screenNotes[selected];
    if (!note?.item) return;
    store.dispatch({ type: 'collectScreen', screen: selected, collected: !note.collected });
  });
  itemRow.append(spotSelect, itemSelect, collectedToggle);

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

