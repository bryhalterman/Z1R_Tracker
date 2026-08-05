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
import { memoise, runPatches, type Patch } from './patch.js';

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
  compact = false,
): HTMLElement {
  if (compact) return buildCompactLocations(store, resolver, patches, interactive);
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
    renderedSignature = memoise(renderedSignature, signature, () => rebuild(state)) ?? '';
    runPatches(rowPatches, state);

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
    renderedSprite = memoise(renderedSprite, sprite, () => {
      if (sprite) slot.replaceChildren(createSprite(resolver, sprite, { size: 22 }));
      else slot.replaceChildren();
    });
  });

  return row;
}


/* ------------------------------------------------------------------ compact */

/** Single letter per slot kind — the whole label will not fit at this size. */
const KIND_INITIAL: Record<string, string> = {
  floor: 'F',
  stair: 'S',
  heart: 'H',
  overworld: 'O',
};

/**
 * Dense variant for the OBS dock and overlay.
 *
 * On stream the game capture is the premium space, so this is built to take as
 * little of it as possible: one line per level, each slot an 18px chip. The
 * full layout is a card per level with a dropdown per row — roughly six times
 * the area, which is reasonable on a desktop and indefensible over gameplay.
 *
 * The chips still carry both facts the full layout does. A known item shows its
 * sprite; collected is a solid border against a dashed one, so the distinction
 * survives without colour and without a label.
 */
function buildCompactLocations(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'z1r-panel z1r-locations-compact-panel';

  const title = document.createElement('h2');
  title.className = 'z1r-panel-title';
  title.textContent = 'Locations';
  const summary = document.createElement('span');
  summary.className = 'z1r-locations-summary';
  title.append(summary);
  root.append(title);

  const body = document.createElement('div');
  body.className = 'z1r-locations-compact';
  root.append(body);

  // One reused picker rather than one per slot; also acts as the legend.
  const picker = document.createElement('div');
  picker.className = 'z1r-slot-picker';
  picker.hidden = true;
  picker.setAttribute('role', 'menu');
  let pickerSlot = '';

  const closePicker = () => {
    picker.hidden = true;
    pickerSlot = '';
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onEscape, true);
  };
  function onOutside(event: Event) {
    if (!picker.contains(event.target as Node)) closePicker();
  }
  function onEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') closePicker();
  }

  const choose = (item: string) => {
    store.dispatch({ type: 'setLocation', id: pickerSlot, item });
    closePicker();
  };

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'z1r-slot-option';
  clear.textContent = '— clear —';
  clear.addEventListener('click', () => choose(''));
  picker.append(clear);
  for (const entry of SHUFFLE_POOL) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'z1r-slot-option';
    option.append(createSprite(resolver, entry.sprite, { size: 16, label: entry.name }));
    option.append(Object.assign(document.createElement('span'), { textContent: entry.name }));
    option.addEventListener('click', () => choose(entry.id));
    picker.append(option);
  }
  root.append(picker);

  const openPicker = (slotId: string, anchor: HTMLElement) => {
    if (pickerSlot === slotId && !picker.hidden) return closePicker();
    pickerSlot = slotId;
    picker.hidden = false;
    const box = anchor.getBoundingClientRect();
    const panel = root.getBoundingClientRect();
    picker.style.insetInlineStart = `${Math.max(2, box.left - panel.left)}px`;
    picker.style.insetBlockStart = `${box.bottom - panel.top + 2}px`;
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onEscape, true);
    picker.querySelector<HTMLElement>('.z1r-slot-option')?.focus();
  };

  let renderedSignature = '';
  const slotPatches: Patch[] = [];

  const rebuild = (state: TrackerState) => {
    body.replaceChildren();
    slotPatches.length = 0;

    const grouped = new Map<string, LocationDef[]>();
    for (const location of deriveLocations(state.seed, state.extraFloorSlots)) {
      const key = location.level === undefined ? 'OW' : `L${location.level}`;
      const list = grouped.get(key);
      if (list) list.push(location);
      else grouped.set(key, [location]);
    }

    for (const [label, list] of grouped) {
      const row = document.createElement('div');
      row.className = 'z1r-compact-row';
      row.append(Object.assign(document.createElement('span'), {
        className: 'z1r-compact-level',
        textContent: label,
      }));

      for (const location of list) {
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = 'z1r-compact-slot';
        slot.dataset.kind = location.kind;
        slot.disabled = !interactive;
        if (interactive) {
          slot.addEventListener('click', () => openPicker(location.id, slot));
          // Right-click toggles collected — the second fact, without a second control.
          slot.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const current = store.getState().locations[location.id];
            store.dispatch({
              type: 'collectLocation',
              id: location.id,
              collected: !(current?.collected ?? false),
            });
          });
        }

        const face = document.createElement('span');
        face.className = 'z1r-compact-face';
        slot.append(face);
        row.append(slot);

        let renderedItem: string | null = null;
        slotPatches.push((s2) => {
          const current = s2.locations[location.id] ?? { item: '', collected: false };
          slot.dataset.collected = String(current.collected);
          slot.dataset.known = String(!!current.item);
          const entry = current.item ? POOL_BY_ID.get(current.item) : undefined;
          slot.title =
            `${location.label} — ${entry?.name ?? 'unknown'}` +
            `${current.collected ? ' (collected)' : ''}`;
          renderedItem = memoise(renderedItem, current.item, () => {
            if (entry) face.replaceChildren(createSprite(resolver, entry.sprite, { size: 16 }));
            else face.textContent = KIND_INITIAL[location.kind] ?? '?';
          });
        });
      }
      body.append(row);
    }
  };

  patches.push((state) => {
    const locations = deriveLocations(state.seed, state.extraFloorSlots);
    const signature = locations.map((l) => l.id).join('|');
    renderedSignature = memoise(renderedSignature, signature, () => rebuild(state)) ?? '';
    runPatches(slotPatches, state);
    const collected = locations.filter((l) => state.locations[l.id]?.collected).length;
    summary.textContent = `${collected}/${locations.length}`;
  });

  return root;
}
