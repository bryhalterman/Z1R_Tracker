/**
 * The tracker view.
 *
 * Builds its DOM once and then patches it on every state change. A full
 * re-render would be simpler, but this view runs inside an OBS browser source
 * alongside a game capture — churning hundreds of nodes per click is exactly
 * the kind of thing that shows up as a dropped frame on stream.
 */

import {
  DUNGEONS,
  MARKS,
  MARKS_BY_KIND,
  OVERWORLD_COLUMNS,
  OVERWORLD_ROWS,
  REGIONS_BY_ID,
  regionForScreen,
  ITEMS,
  labelFor,
  maxValue,
  screenId,
  spriteFor,
  type ItemDef,
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

function section(title: string, bodyClass: string): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', 'z1r-panel');
  root.append(el('h2', 'z1r-panel-title', title));
  const body = el('div', bodyClass);
  root.append(body);
  return { root, body };
}

export function mountTracker(root: HTMLElement, options: MountOptions): () => void {
  const {
    store,
    resolver,
    mode = 'full',
    interactive = true,
    sections = DEFAULT_SECTIONS,
    itemSize = 40,
  } = options;

  // Spectrum scopes its tokens to these classes, so the mount root carries them
  // rather than requiring each app's HTML to opt in. `medium` is the desktop
  // scale; `large` is for touch and would inflate every control.
  root.classList.add('z1r-tracker', 'spectrum', 'spectrum--dark', 'spectrum--medium');
  root.dataset.mode = mode;
  root.dataset.interactive = String(interactive);
  root.replaceChildren();

  const patches: Patch[] = [];
  const builders: Record<TrackerSection, () => HTMLElement> = {
    seed: () => buildSeedPanel(store, patches, interactive),
    items: () => buildItems(store, resolver, patches, { interactive, itemSize }),
    dungeons: () => buildTriforce(store, patches, interactive),
    locations: () => buildLocations(store, resolver, patches, interactive),
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

  apply(store.getState());
  const unsubscribe = store.subscribe(apply);

  return () => {
    unsubscribe();
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
   * Mark palette.
   *
   * Built once and moved, rather than one popover per cell. It also serves as
   * the map's legend — every mark is shown with its icon and its name, which
   * is the non-colour channel the icons alone don't provide.
   */
  const palette = el('div', 'z1r-mark-palette');
  palette.hidden = true;
  palette.setAttribute('role', 'menu');
  palette.setAttribute('aria-label', 'Choose a marker for this screen');
  let paletteScreen = '';

  const closePalette = () => {
    palette.hidden = true;
    paletteScreen = '';
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onEscape, true);
  };

  function onOutside(event: Event) {
    if (!palette.contains(event.target as Node)) closePalette();
  }
  function onEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    const cell = body.querySelector<HTMLElement>(`[data-screen="${paletteScreen}"]`);
    closePalette();
    cell?.focus();
  }

  for (const mark of MARKS) {
    const option = el('button', 'z1r-mark-option');
    option.type = 'button';
    option.setAttribute('role', 'menuitem');
    option.dataset.mark = mark.kind;
    option.style.setProperty('--mark-color', mark.color);
    if (mark.sprite) {
      option.append(createSprite(resolver, mark.sprite, { size: 18, label: mark.name }));
    } else {
      option.append(el('span', 'z1r-mark-option-clear', '—'));
    }
    option.append(el('span', 'z1r-mark-option-name', mark.name));
    option.addEventListener('click', () => {
      const screen = paletteScreen;
      const cell = body.querySelector<HTMLElement>(`[data-screen="${screen}"]`);
      store.dispatch({ type: 'setMark', screen, mark: mark.kind });
      closePalette();
      cell?.focus();
    });
    palette.append(option);
  }
  root.append(palette);

  function openPalette(screen: string, cell: HTMLElement) {
    // Clicking the screen whose palette is already open closes it.
    if (paletteScreen === screen && !palette.hidden) {
      closePalette();
      return;
    }
    paletteScreen = screen;
    palette.hidden = false;
    palette.dataset.screen = screen;

    const cellBox = cell.getBoundingClientRect();
    const panelBox = root.getBoundingClientRect();
    palette.style.insetInlineStart = `${cellBox.left - panelBox.left + cellBox.width / 2}px`;
    palette.style.insetBlockStart = `${cellBox.top - panelBox.top + cellBox.height}px`;
    // Nudge back inside the panel when the cell is near an edge.
    const paletteBox = palette.getBoundingClientRect();
    const overflowRight = paletteBox.right - panelBox.right + 8;
    if (overflowRight > 0) {
      palette.style.insetInlineStart = `${cellBox.left - panelBox.left + cellBox.width / 2 - overflowRight}px`;
    }

    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onEscape, true);
    palette.querySelector<HTMLElement>('.z1r-mark-option')?.focus();
  }

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
        cell.addEventListener('click', () => openPalette(id, cell));
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
      terrainImage.loading = 'lazy';
      terrainImage.decoding = 'async';
      terrainImage.style.width = `${MAP_COLUMNS_PERCENT}%`;
      terrainImage.style.height = `${MAP_ROWS_PERCENT}%`;
      terrainImage.style.insetInlineStart = `${-(col - 1) * 100}%`;
      terrainImage.style.insetBlockStart = `${-(row - 1) * 100}%`;
      terrain.append(terrainImage);

      // The region code is the non-colour channel: two letters, always legible,
      // where a tint alone would be unreadable to a colour-blind viewer.
      const code = el('span', 'z1r-screen-region');
      const slot = el('span', 'z1r-screen-mark');
      cell.append(terrain, code, slot);

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

      patches.push((state) => {
        const mark = state.marks[id] ?? 'none';
        const def = MARKS_BY_KIND.get(mark);
        renderedMark = memoise(renderedMark, mark, () => {
          cell.dataset.mark = mark;
          cell.style.setProperty('--mark-color', def?.color ?? 'transparent');
          if (!def?.sprite) slot.replaceChildren();
          else slot.replaceChildren(createSprite(resolver, def.sprite, { size: 18, label: def.name }));
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
        if (def && mark !== 'none') parts.push(def.name);
        cell.title = parts.join(' — ');
      });

      body.append(cell);
    }
  }

  return root;
}

