/**
 * Item location tracking.
 *
 * The point of this panel in a randomizer run is to answer "where did that
 * come from, and what's left unchecked". Slots are derived from the seed
 * settings rather than stored, so switching Dungeon Quest reshapes the list —
 * see `deriveLocations`.
 */

import {
  POOL_BY_ID,
  SHUFFLE_POOL,
  deriveLocations,
  type LocationDef,
  type SpriteResolver,
  type Store,
  type TrackerState,
} from '@z1r/core';
import { createSprite } from './sprite.js';

type Patch = (state: TrackerState) => void;

/** Slot kind is the thing the owner most wants at a glance, so it gets a chip. */
const KIND_LABEL: Record<string, string> = {
  floor: 'Floor',
  stair: 'Stair',
  heart: 'Heart',
  overworld: 'OW',
};

const KIND_TITLE: Record<string, string> = {
  floor: 'Lying on the dungeon floor',
  stair: 'Behind a staircase / item basement',
  heart: 'Heart Container',
  overworld: 'Named overworld location',
};

export function buildLocations(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'z1r-panel z1r-locations';
  const title = document.createElement('h2');
  title.className = 'z1r-panel-title';
  title.textContent = 'Item locations';
  root.append(title);

  const summary = document.createElement('span');
  summary.className = 'z1r-locations-summary';
  title.append(summary);

  const body = document.createElement('div');
  body.className = 'z1r-location-groups';
  root.append(body);

  // Rebuilding is driven by the *shape* of the derived list, not by every
  // state change — the rows themselves patch in place.
  let renderedSignature = '';
  const rowPatches: Patch[] = [];

  const rebuild = (state: TrackerState) => {
    body.replaceChildren();
    rowPatches.length = 0;

    const locations = deriveLocations(state.seed, state.extraFloorSlots);
    const groups = new Map<string, LocationDef[]>();
    for (const location of locations) {
      const key = location.level === undefined ? 'Overworld' : `Level ${location.level}`;
      const list = groups.get(key);
      if (list) list.push(location);
      else groups.set(key, [location]);
    }

    for (const [name, list] of groups) {
      const group = document.createElement('div');
      group.className = 'z1r-location-group';

      const head = document.createElement('div');
      head.className = 'z1r-location-group-head';
      head.append(Object.assign(document.createElement('span'), { textContent: name }));

      const level = list[0]?.level;
      if (interactive && level !== undefined && state.seed.shuffleMinorDrops) {
        // Only reachable with Shuffle Minor Drops on, which is the flag that
        // allows more than one item on a dungeon floor.
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'z1r-slot-add';
        add.textContent = '+ floor';
        add.title = 'Add an extra floor slot for this level';
        add.addEventListener('click', () =>
          store.dispatch({ type: 'addFloorSlot', level, delta: 1 }),
        );
        head.append(add);

        if ((state.extraFloorSlots[String(level)] ?? 0) > 0) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'z1r-slot-add';
          remove.textContent = '−';
          remove.title = 'Remove the last extra floor slot';
          remove.addEventListener('click', () =>
            store.dispatch({ type: 'addFloorSlot', level, delta: -1 }),
          );
          head.append(remove);
        }
      }

      group.append(head);
      for (const location of list) {
        group.append(buildRow(store, resolver, location, rowPatches, interactive));
      }
      body.append(group);
    }
  };

  patches.push((state) => {
    const locations = deriveLocations(state.seed, state.extraFloorSlots);
    const signature = `${locations.map((l) => l.id).join('|')}::${state.seed.shuffleMinorDrops}`;
    if (signature !== renderedSignature) {
      renderedSignature = signature;
      rebuild(state);
    }
    for (const patch of rowPatches) patch(state);

    const collected = locations.filter((l) => state.locations[l.id]?.collected).length;
    summary.textContent = `${collected}/${locations.length}`;
  });

  return root;
}

function buildRow(
  store: Store,
  resolver: SpriteResolver,
  location: LocationDef,
  patches: Patch[],
  interactive: boolean,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'z1r-location';
  row.dataset.kind = location.kind;

  const kind = document.createElement('span');
  kind.className = 'z1r-location-kind';
  kind.textContent = KIND_LABEL[location.kind] ?? location.kind;
  kind.title = KIND_TITLE[location.kind] ?? '';

  const label = document.createElement('span');
  label.className = 'z1r-location-label';
  label.textContent = location.label;
  if (location.note) label.title = location.note;

  const slot = document.createElement('span');
  slot.className = 'z1r-location-sprite';

  const picker = document.createElement('select');
  picker.className = 'z1r-input z1r-location-picker';
  picker.disabled = !interactive;
  const unknown = document.createElement('option');
  unknown.value = '';
  unknown.textContent = '—';
  picker.append(unknown);
  for (const entry of SHUFFLE_POOL) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    picker.append(option);
  }
  picker.addEventListener('change', () =>
    store.dispatch({ type: 'setLocation', id: location.id, item: picker.value }),
  );

  const collected = document.createElement('input');
  collected.type = 'checkbox';
  collected.className = 'z1r-location-check';
  collected.title = 'Picked up. Ticking this also marks the item found; unticking never removes it.';
  collected.disabled = !interactive;
  collected.addEventListener('change', () =>
    store.dispatch({ type: 'collectLocation', id: location.id, collected: collected.checked }),
  );

  row.append(kind, label, slot, picker, collected);

  let renderedSprite: string | null = null;
  patches.push((state) => {
    const current = state.locations[location.id] ?? { item: '', collected: false };
    if (document.activeElement !== picker) picker.value = current.item;
    collected.checked = current.collected;
    row.dataset.collected = String(current.collected);
    row.dataset.known = String(!!current.item);

    const sprite = current.item ? (POOL_BY_ID.get(current.item)?.sprite ?? '') : '';
    if (sprite !== renderedSprite) {
      renderedSprite = sprite;
      if (sprite) slot.replaceChildren(createSprite(resolver, sprite, { size: 22 }));
      else slot.replaceChildren();
    }
  });

  return row;
}
