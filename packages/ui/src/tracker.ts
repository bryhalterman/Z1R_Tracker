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
  ITEMS_BY_ID,
  MARKS_BY_KIND,
  OVERWORLD_COLUMNS,
  OVERWORLD_ROWS,
  TRIFORCE_REQUIRED_FOR_L9,
  canEnterLevel9,
  clearedCount,
  evaluateAll,
  itemsForGame,
  labelFor,
  maxValue,
  screenId,
  spriteFor,
  triforceCount,
  type ItemDef,
  type SpriteResolver,
  type Store,
  type TrackerState,
} from '@z1r/core';
import { createSprite } from './sprite.js';
import { buildSeedPanel } from './seed-panel.js';
import { buildLocations } from './locations.js';

export type TrackerSection =
  | 'summary'
  | 'seed'
  | 'items'
  | 'dungeons'
  | 'locations'
  | 'map'
  | 'hints';

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
  'summary',
  'seed',
  'items',
  'dungeons',
  'locations',
  'map',
  'hints',
];

type Patch = (state: TrackerState) => void;

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

  root.classList.add('z1r-tracker');
  root.dataset.mode = mode;
  root.dataset.interactive = String(interactive);
  root.replaceChildren();

  const patches: Patch[] = [];
  const builders: Record<TrackerSection, () => HTMLElement> = {
    summary: () => buildSummary(patches),
    seed: () => buildSeedPanel(store, patches, interactive),
    items: () => buildItems(store, resolver, patches, { interactive, itemSize }),
    dungeons: () => buildDungeons(store, resolver, patches, interactive),
    locations: () => buildLocations(store, resolver, patches, interactive),
    map: () => buildMap(store, resolver, patches, interactive),
    hints: () => buildHints(patches),
  };

  for (const name of sections) {
    // An unknown `?sections=` value must not take the whole overlay down.
    const build = builders[name];
    if (build) root.append(build());
  }

  const apply = (state: TrackerState) => {
    root.dataset.game = state.game;
    for (const patch of patches) patch(state);
  };

  apply(store.getState());
  const unsubscribe = store.subscribe(apply);

  return () => {
    unsubscribe();
    root.replaceChildren();
    root.classList.remove('z1r-tracker');
  };
}

/* ------------------------------------------------------------------ summary */

function buildSummary(patches: Patch[]): HTMLElement {
  const root = el('section', 'z1r-panel z1r-summary');

  const stat = (label: string) => {
    const wrap = el('div', 'z1r-stat');
    const value = el('span', 'z1r-stat-value', '0');
    wrap.append(value, el('span', 'z1r-stat-label', label));
    root.append(wrap);
    return value;
  };

  const triforce = stat('Triforce');
  const cleared = stat('Cleared');
  const hearts = stat('Hearts');

  const status = el('div', 'z1r-status');
  root.append(status);

  patches.push((state) => {
    const pieces = triforceCount(state);
    triforce.textContent = `${pieces}/${TRIFORCE_REQUIRED_FOR_L9}`;
    cleared.textContent = `${clearedCount(state)}/${DUNGEONS.length}`;
    hearts.textContent = String(state.items['heartContainers'] ?? 0);
    const ready = canEnterLevel9(state);
    status.textContent = ready ? 'Level 9 is open' : `${TRIFORCE_REQUIRED_FOR_L9 - pieces} to go`;
    status.dataset.ready = String(ready);
  });

  return root;
}

/* -------------------------------------------------------------------- items */

function buildItems(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  opts: { interactive: boolean; itemSize: number },
): HTMLElement {
  const { root, body } = section('Items', 'z1r-item-grid');
  // Rebuilt whenever the game switches, since the visible item set differs.
  let renderedGame: string | null = null;
  const cellPatches: Patch[] = [];

  const build = (state: TrackerState) => {
    body.replaceChildren();
    cellPatches.length = 0;
    for (const def of itemsForGame(state.game)) {
      body.append(buildItemCell(store, resolver, def, cellPatches, opts));
    }
  };

  patches.push((state) => {
    if (state.game !== renderedGame) {
      renderedGame = state.game;
      build(state);
    }
    for (const patch of cellPatches) patch(state);
  });

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
    cell.addEventListener('click', () => {
      store.dispatch({ type: 'cycleItem', id: def.id, direction: 1 });
    });
    cell.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      store.dispatch({ type: 'cycleItem', id: def.id, direction: -1 });
    });
    if (def.kind === 'counter') {
      cell.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();
          store.dispatch({ type: 'cycleItem', id: def.id, direction: event.deltaY < 0 ? 1 : -1 });
        },
        { passive: false },
      );
    }
  }

  let renderedSprite: string | null = null;

  patches.push((state) => {
    const value = state.items[def.id] ?? 0;
    const key = spriteFor(def, value);
    if (key !== renderedSprite) {
      renderedSprite = key;
      slot.replaceChildren(createSprite(resolver, key, { size: opts.itemSize }));
    }
    cell.dataset.owned = String(value > 0);
    cell.title = def.note ? `${labelFor(def, value)} — ${def.note}` : labelFor(def, value);

    if (def.kind === 'counter') {
      badge.textContent = String(value);
      badge.hidden = false;
    } else if (def.kind === 'progressive' && value > 0 && maxValue(def) > 1) {
      badge.textContent = String(value);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  });

  return cell;
}

/* ----------------------------------------------------------------- dungeons */

const DUNGEON_FLAGS = [
  { key: 'triforce', label: 'Triforce', sprite: 'ui.triforce' },
  { key: 'cleared', label: 'Boss', sprite: 'ui.ganon' },
  { key: 'map', label: 'Map', sprite: 'ui.map' },
  { key: 'compass', label: 'Compass', sprite: 'ui.compass' },
] as const;

function buildDungeons(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
): HTMLElement {
  const { root, body } = section('Dungeons', 'z1r-dungeon-list');

  for (const def of DUNGEONS) {
    const row = el('div', 'z1r-dungeon');
    row.dataset.level = String(def.level);

    const head = el('div', 'z1r-dungeon-head');
    head.append(createSprite(resolver, def.sprite, { size: 28, label: `Level ${def.level}` }));
    head.append(el('span', 'z1r-dungeon-name', `${def.level}`));
    row.append(head);

    const flags = el('div', 'z1r-dungeon-flags');
    for (const flag of DUNGEON_FLAGS) {
      // Level 9 holds Ganon rather than a Triforce piece.
      if (flag.key === 'triforce' && def.level === 9) continue;

      const button = el('button', 'z1r-flag');
      button.type = 'button';
      button.dataset.flag = flag.key;
      button.title = `${flag.label} — Level ${def.level}`;
      button.append(createSprite(resolver, flag.sprite, { size: 22, label: flag.label }));
      if (!interactive) button.disabled = true;
      else {
        button.addEventListener('click', () => {
          const current = store.getState().dungeons[String(def.level)];
          store.dispatch({
            type: 'setDungeon',
            level: def.level,
            patch: { [flag.key]: !(current?.[flag.key] ?? false) },
          });
        });
      }
      flags.append(button);
      patches.push((state) => {
        button.dataset.on = String(state.dungeons[String(def.level)]?.[flag.key] ?? false);
      });
    }
    row.append(flags);

    const location = el('input', 'z1r-dungeon-location');
    location.type = 'text';
    location.placeholder = 'screen';
    location.maxLength = 4;
    location.spellcheck = false;
    location.title = `Where Level ${def.level} was found`;
    if (!interactive) location.readOnly = true;
    else {
      location.addEventListener('change', () => {
        store.dispatch({
          type: 'setDungeon',
          level: def.level,
          patch: { location: location.value.trim().toUpperCase(), found: !!location.value.trim() },
        });
      });
    }
    row.append(location);

    patches.push((state) => {
      const dungeon = state.dungeons[String(def.level)];
      // Never stomp what the user is mid-way through typing.
      if (document.activeElement !== location) location.value = dungeon?.location ?? '';
      row.dataset.cleared = String(dungeon?.cleared ?? false);
      row.dataset.found = String(dungeon?.found ?? false);
    });

    body.append(row);
  }

  return root;
}

/* ---------------------------------------------------------------- overworld */

function buildMap(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
): HTMLElement {
  const { root, body } = section('Overworld', 'z1r-map');
  body.style.setProperty('--map-columns', String(OVERWORLD_COLUMNS));

  // The community hint-location map is the thing you actually reach for when
  // an old man gives you a hint, so it lives one click away rather than in a
  // browser tab behind OBS.
  const reference = resolver.resolve('ref.owHints');
  if (reference.kind === 'image') {
    const toggle = el('button', 'z1r-map-ref-toggle', 'Hint locations');
    toggle.type = 'button';
    toggle.title = 'Show the overworld hint-location reference map';

    const figure = el('figure', 'z1r-map-ref');
    figure.hidden = true;
    const image = el('img');
    image.alt = reference.name;
    image.loading = 'lazy';
    figure.append(image);

    toggle.addEventListener('click', () => {
      figure.hidden = !figure.hidden;
      toggle.dataset.open = String(!figure.hidden);
      // Fetch only on first reveal — it's a 135 kB third-party image.
      if (!figure.hidden && !image.src) image.src = reference.url;
    });

    root.querySelector('.z1r-panel-title')?.append(toggle);
    root.append(figure);
  }

  for (let row = 1; row <= OVERWORLD_ROWS; row++) {
    for (let col = 1; col <= OVERWORLD_COLUMNS; col++) {
      const id = screenId(col, row);
      const cell = el('button', 'z1r-screen');
      cell.type = 'button';
      cell.dataset.screen = id;
      cell.title = id;
      if (!interactive) cell.disabled = true;
      else {
        cell.addEventListener('click', () => {
          store.dispatch({ type: 'cycleMark', screen: id, direction: 1 });
        });
        cell.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          store.dispatch({ type: 'cycleMark', screen: id, direction: -1 });
        });
      }

      let renderedMark: string | null = null;
      patches.push((state) => {
        const mark = state.marks[id] ?? 'none';
        if (mark === renderedMark) return;
        renderedMark = mark;
        const def = MARKS_BY_KIND.get(mark);
        cell.dataset.mark = mark;
        cell.style.setProperty('--mark-color', def?.color ?? 'transparent');
        cell.title = def && mark !== 'none' ? `${id} — ${def.name}` : id;
        if (!def?.sprite) cell.replaceChildren();
        else cell.replaceChildren(createSprite(resolver, def.sprite, { size: 20, label: def.name }));
      });

      body.append(cell);
    }
  }

  return root;
}

/* -------------------------------------------------------------------- hints */

function buildHints(patches: Patch[]): HTMLElement {
  const { root, body } = section('Can I…', 'z1r-hints');
  const chips = new Map<string, HTMLElement>();

  patches.push((state) => {
    for (const result of evaluateAll(state)) {
      let chip = chips.get(result.id);
      if (!chip) {
        chip = el('span', 'z1r-hint', result.label);
        chips.set(result.id, chip);
        body.append(chip);
      }
      chip.dataset.met = String(result.met);
      chip.title = result.met
        ? result.label
        : `Needs: ${result.missing.map((id) => ITEMS_BY_ID.get(id)?.name ?? id).join(', ')}`;
    }
  });

  return root;
}
