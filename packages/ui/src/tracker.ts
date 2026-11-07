/**
 * The tracker view.
 *
 * Builds each panel's shell once as plain DOM and renders the panel itself as
 * React, re-rendered with the whole state on every change; the memoized cells
 * and the per-state location cache keep that cheap. See the Rendering section
 * of docs/ARCHITECTURE.md.
 */

import type { SpriteResolver, Store, TrackerState } from '@z1r/core';
import { collectDisposers } from './shared/disposers.js';
import { runPatches, type Patch } from './patch.js';
import { el } from './dom.js';
import { wireCollapsing } from './collapse.js';
import { startLayout } from './layout.js';
import { buildItems } from './items-panel.js';
import { buildPalette } from './palette-panel.js';
import { buildMap } from './map-panel.js';
import { buildSeedPanel } from './seed-panel.js';
import { buildLocations } from './locations.js';
import { buildHintTracker } from './hints.js';
import { buildTriforce } from './triforce.js';
import { buildRooms, createPlacement } from './rooms.js';

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
  const { placeInto, palette, piecesInLocations } = placementPlan(sections, interactive, compact);

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
   * What the panels must undo on teardown: each panel's React root registers
   * its own unmount while the panels are built (see `collectDisposers`), and
   * so does anything they add to the document. The mount's own pieces are
   * undone beside them in the teardown below: the Escape listener directly,
   * and the observer and the Maps watcher through `startLayout`'s dispose.
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
  const main = palette ? placeRail(root, built) : null;
  if (!main) placeStacked(root, built);

  // Isolated per panel: the store has already committed this state, so a throw
  // here would otherwise leave every later panel showing the previous one.
  const apply = (state: TrackerState) => runPatches(patches, state);

  /*
   * Folding is for the dock and the page, never the overlay: a browser source
   * takes no clicks, so a caret there would be furniture that cannot be used.
   */
  if (interactive) collect(() => wireCollapsing(root, defaultCollapsed));

  const stopLayout = startLayout(root, main, { mode, followMapsLayout });

  apply(store.getState());
  const unsubscribe = store.subscribe(apply);

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', onEscape, true);
    stopLayout();
    for (const dispose of disposers) dispose();
    root.replaceChildren();
    root.classList.remove('z1r-tracker');
    // What this mount wrote on the root, so a later mount starts clean.
    for (const key of ['mode', 'compact', 'interactive', 'width', 'rail']) delete root.dataset[key];
  };
}

/** Whether this mount's Items panel is a placement palette, and what it feeds. */
function placementPlan(sections: readonly TrackerSection[], interactive: boolean, compact: boolean) {
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
  return { placeInto, palette, piecesInLocations };
}

/**
 * On the page the palette is a column of its own down the left edge, sticky
 * as the page scrolls, so it is beside whichever map you are dropping onto.
 * Item locations sits above it, a row per level, so what the palette fills
 * in is in the same column as the palette. Everything else stacks in the
 * main column in its usual order.
 *
 * Returns the main column, or `null` with nothing placed when there is no
 * Items panel to make the rail of.
 */
function placeRail(root: HTMLElement, built: ReadonlyMap<TrackerSection, HTMLElement>): HTMLElement | null {
  const items = built.get('items');
  if (!items) return null;
  const rail = el('aside', 'z1r-rail');
  // The column's width is worked out from the tile size — see `.z1r-rail`.
  rail.style.setProperty('--z1r-item-min', items.style.getPropertyValue('--z1r-item-min'));
  const locations = built.get('locations');
  if (locations) rail.append(locations);
  rail.append(items);
  const main = el('div', 'z1r-main');
  for (const [name, node] of built) if (name !== 'items' && name !== 'locations') main.append(node);
  root.dataset.rail = 'true';
  root.append(rail, main);
  return main;
}

/** Every panel straight into the root, in order. */
function placeStacked(root: HTMLElement, built: ReadonlyMap<TrackerSection, HTMLElement>): void {
  const items = built.get('items');
  const triforce = built.get('dungeons');
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
