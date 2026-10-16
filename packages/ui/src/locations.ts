/**
 * Item location tracking.
 *
 * The point of this panel in a randomizer run is to answer "where did that
 * come from, and what's left unchecked". Slots are derived from the seed
 * settings rather than stored, so switching Dungeon Quest reshapes the list —
 * see `deriveLocations`.
 *
 * Items are not chosen here, for the same reason they are not chosen on the
 * room sheet: one is armed in the Items panel and dropped by clicking a slot,
 * through the channel `createPlacement` owns. Recording an item is recording
 * *where it is* and never grants it — saying you hold the thing is
 * `collectLocation`, which stays a separate gesture on the same box.
 */

import {
  POOL_BY_ID,
  SHUFFLE_POOL,
  TRIFORCE_REQUIRED_FOR_L9,
  canEnterLevel9,
  deriveLocations,
  triforceCount,
  type LocationDef,
  type SpriteResolver,
  type Store,
  type TrackerState,
} from '@z1r/core';
import { createSprite } from './sprite.js';
import { memoise, runPatches, type Patch } from './patch.js';
import type { PlacementChannel } from './rooms.js';

/**
 * What a slot shows before its item is known.
 *
 * A glyph rather than a labelled chip: the shape says which kind of slot this
 * is on its own, so the kind survives being read in grayscale and costs no
 * width. `stair` is deliberately absent — it draws the tracker's own staircase
 * art instead, the same shape the overworld warps and the room sheet use, so a
 * staircase reads the same way wherever it appears.
 */
const KIND_GLYPH: Record<string, string> = {
  floor: '▭',
  heart: '♥',
  overworld: '◆',
};

const KIND_TITLE: Record<string, string> = {
  floor: 'Lying on the dungeon floor',
  stair: 'Behind a staircase / item basement',
  heart: 'Heart Container',
  overworld: 'Named overworld location',
};

/** Sprite edge length inside a 24px box, leaving its border and padding. */
const SLOT_ART = 20;

/** The staircase is drawn art, so it sits inside the box rather than filling it. */
const SLOT_GLYPH_ART = 14;

export function buildLocations(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
  compact = false,
  placement?: PlacementChannel,
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

  const rows = document.createElement('div');
  rows.className = 'z1r-loc-rows';
  rows.dataset.arming = 'false';
  root.append(rows);

  /**
   * The armed item, when a slot here can actually take it.
   *
   * The Items panel arms a `ROOM_ITEMS` id, which is the shuffle pool plus the
   * Map, the Compass and a Triforce piece — three things generated per level
   * that no item location stands for. A slot holds a pool entry, so anything
   * outside the pool counts as nothing armed in this panel: the rows drop
   * their arming cue and a click goes back to toggling collected, rather than
   * taking a click that would record an id this panel cannot draw.
   */
  const armedItem = (): string => {
    const brush = placement?.get();
    if (!brush?.placing) return '';
    return POOL_BY_ID.has(brush.item) ? brush.item : '';
  };

  // Rebuilding is driven by the *shape* of the derived list, not by every
  // state change — the slots themselves patch in place.
  let renderedSignature = '';
  const slotPatches: Patch[] = [];

  const rebuild = (state: TrackerState) => {
    rows.replaceChildren();
    slotPatches.length = 0;

    const groups = new Map<string, LocationDef[]>();
    for (const location of deriveLocations(state.seed, state.extraFloorSlots)) {
      const key = location.level === undefined ? 'OW' : `L${location.level}`;
      const list = groups.get(key);
      if (list) list.push(location);
      else groups.set(key, [location]);
    }

    for (const [name, list] of groups) {
      const block = document.createElement('div');
      block.className = 'z1r-loc-block';

      const level = list[0]?.level;
      const label = document.createElement('span');
      label.className = 'z1r-loc-level';
      label.textContent = name;
      // The long form stays reachable on hover: the line has room for two
      // characters, and "OW" is not self-explanatory on a first read.
      label.title = level === undefined ? 'Overworld locations' : `Level ${level}`;
      block.append(label);

      for (const location of list) {
        block.append(buildSlot(store, resolver, location, slotPatches, interactive, armedItem));
      }

      if (interactive && level !== undefined && state.seed.shuffleMinorDrops) {
        // Only reachable with Shuffle Minor Drops on, which is the flag that
        // allows more than one item on a dungeon floor. A bare sign rather than
        // "+ floor": the line is 24px tall, and the level it belongs to is
        // named at the head of that same line.
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'z1r-slot-add';
        add.textContent = '+';
        add.title = 'Add an extra floor slot for this level';
        add.setAttribute('aria-label', add.title);
        add.addEventListener('click', () =>
          store.dispatch({ type: 'addFloorSlot', level, delta: 1 }),
        );
        block.append(add);

        if ((state.extraFloorSlots[String(level)] ?? 0) > 0) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'z1r-slot-add';
          remove.textContent = '−';
          remove.title = 'Remove the last extra floor slot';
          remove.setAttribute('aria-label', remove.title);
          remove.addEventListener('click', () =>
            store.dispatch({ type: 'addFloorSlot', level, delta: -1 }),
          );
          block.append(remove);
        }
      }

      rows.append(block);
    }
  };

  const draw: Patch = (state) => {
    const locations = deriveLocations(state.seed, state.extraFloorSlots);
    const signature = `${locations.map((l) => l.id).join('|')}::${state.seed.shuffleMinorDrops}`;
    renderedSignature = memoise(renderedSignature, signature, () => rebuild(state)) ?? '';
    // One attribute for the whole set rather than one per box: the cue is
    // "a click in here records now", which is a fact about the panel.
    rows.dataset.arming = String(!!armedItem());
    runPatches(slotPatches, state);

    const collected = locations.filter((l) => state.locations[l.id]?.collected).length;
    summary.textContent = `${collected}/${locations.length}`;
  };

  patches.push(draw);
  // Arming changes nothing in the store, so the channel drives its own redraw —
  // the same way the Items panel redraws its cells.
  placement?.watch(() => draw(store.getState()));

  return root;
}

/**
 * One 24px box: what is known to be here, and whether it has been picked up.
 *
 * Both facts live on one control because they are one gesture apart, and the
 * gesture is the room sheet's — with an item armed a click records it, with
 * nothing armed a click says you have it. The row this replaces spent a
 * dropdown and a checkbox on the same two facts and ten times the width.
 */
function buildSlot(
  store: Store,
  resolver: SpriteResolver,
  location: LocationDef,
  patches: Patch[],
  interactive: boolean,
  armedItem: () => string,
): HTMLElement {
  const slot = document.createElement('button');
  slot.type = 'button';
  slot.className = 'z1r-loc-slot';
  slot.dataset.slot = location.id;
  slot.dataset.kind = location.kind;
  slot.dataset.known = 'false';
  slot.dataset.collected = 'false';
  slot.disabled = !interactive;

  const face = document.createElement('span');
  face.className = 'z1r-loc-face';
  slot.append(face);

  if (interactive) {
    slot.addEventListener('click', () => {
      const armed = armedItem();
      const current = store.getState().locations[location.id] ?? { item: '', collected: false };
      if (armed) {
        /*
         * One gesture both ways.
         *
         * The same armed item on the same box takes it off again, so clearing
         * needs no second control — and this branch dispatches `setLocation`,
         * which records where a thing is and leaves the inventory alone.
         * Collecting is the other branch, below, and it is the only one that
         * can grant anything.
         */
        store.dispatch({
          type: 'setLocation',
          id: location.id,
          item: current.item === armed ? '' : armed,
        });
        return;
      }
      store.dispatch({
        type: 'collectLocation',
        id: location.id,
        collected: !current.collected,
      });
    });

    /*
     * Delete clears what is recorded here.
     *
     * Enter and Space are the click, which records with an item armed and
     * collects without one — neither takes a wrong entry back out unless you
     * first arm that same wrong item, which the dropdown this replaces could
     * do from the keyboard in one step. Delete restores that, and the tooltip
     * names it rather than leaving it to be discovered.
     */
    slot.addEventListener('keydown', (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      event.preventDefault();
      store.dispatch({ type: 'setLocation', id: location.id, item: '' });
    });
  }

  let renderedFace: string | null = null;
  patches.push((state) => {
    const current = state.locations[location.id] ?? { item: '', collected: false };
    const entry = current.item ? POOL_BY_ID.get(current.item) : undefined;
    slot.dataset.known = String(!!entry);
    slot.dataset.collected = String(current.collected);

    const armed = armedItem();
    const armedName = armed ? (POOL_BY_ID.get(armed)?.name ?? armed) : '';
    const gesture = !interactive
      ? ''
      : armed
        ? current.item === armed
          ? ` — click to clear ${armedName}`
          : ` — click to record ${armedName} here`
        : current.collected
          ? ' — click to mark not picked up'
          : ' — click to mark picked up, Delete to clear';
    // Every state in words as well as in the border and the tick: this is what
    // a screen reader is given, and the text channel is the one that does not
    // depend on seeing the difference between a dashed and a solid edge.
    slot.title =
      `${location.label} — ${entry ? entry.name : 'nothing recorded'}` +
      ` — ${current.collected ? 'picked up' : 'not picked up'}` +
      ` (${location.note ?? KIND_TITLE[location.kind] ?? location.kind})` +
      gesture;
    slot.setAttribute('aria-label', slot.title);

    const faceKey = entry ? `item:${entry.sprite}` : `kind:${location.kind}`;
    renderedFace = memoise(renderedFace, faceKey, () => {
      if (entry) {
        face.replaceChildren(createSprite(resolver, entry.sprite, { size: SLOT_ART, label: '' }));
        return;
      }
      if (location.kind === 'stair') {
        face.replaceChildren(
          createSprite(resolver, 'mark.stairway', { size: SLOT_GLYPH_ART, label: '' }),
        );
        return;
      }
      face.replaceChildren();
      face.textContent = KIND_GLYPH[location.kind] ?? '?';
    });
  });

  return slot;
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
 * The three overworld spots are not interchangeable, so they do not share a
 * letter.
 *
 * They rendered as three identical `O` chips, which told you there were three
 * of them and nothing else — you had to hover each one to find out which was
 * the Coast. Dungeon slots genuinely are interchangeable within a level, so
 * those keep their kind initial.
 */
const SPOT_CODE: Record<string, string> = {
  'ow.whiteSword': 'WS',
  'ow.armos': 'AR',
  'ow.coast': 'CO',
};

function slotCode(location: LocationDef): string {
  return SPOT_CODE[location.id] ?? KIND_INITIAL[location.kind] ?? '?';
}

/**
 * Dense variant for the OBS dock and overlay.
 *
 * On stream the game capture is the premium space, so this is built to take as
 * little of it as possible: one column per level, each slot a 20px chip. The
 * full layout is a card per level with a dropdown per row — roughly six times
 * the area, which is reasonable on a desktop and indefensible over gameplay.
 *
 * Columns rather than rows because the panel is bounded by height, not width:
 * ten stacked rows spend a line each on groups that hold two or three slots,
 * while ten columns spend one line on the deepest group and none on the rest.
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

  /*
   * Triforce count and whether Level 9 is open.
   *
   * Both came from the panel this absorbed. The count is the part that was
   * worth keeping — with the pieces spread one per column, nothing else says how
   * many you have without counting them yourself.
   */
  const triforce = document.createElement('span');
  triforce.className = 'z1r-locations-triforce';
  title.append(triforce);
  patches.push((state) => {
    const held = triforceCount(state);
    const open = canEnterLevel9(state);
    triforce.textContent = open
      ? `Triforce ${held}/${TRIFORCE_REQUIRED_FOR_L9} — L9 open`
      : `Triforce ${held}/${TRIFORCE_REQUIRED_FOR_L9}`;
    triforce.dataset.ready = String(open);
  });
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

  /**
   * Puts a level number on the Triforce triangle.
   *
   * The numeral is a positioned sibling of the art rather than part of it, so
   * it takes a color of its own per state instead of inheriting whatever the
   * sprite happens to be, and so the unheld state's gray-out lands on the
   * triangle only. It is anchored near the base because that is the only part
   * of the triangle wide enough to hold a digit — higher up it would cross the
   * transparent corners, where a dark numeral has nothing to read against.
   */
  const appendNumberedTriangle = (host: HTMLElement, text: string): void => {
    const art = document.createElement('span');
    art.className = 'z1r-compact-head-art';
    art.append(createSprite(resolver, 'ui.triforce', { size: 20, label: 'Triforce piece' }));
    host.append(
      art,
      Object.assign(document.createElement('span'), {
        className: 'z1r-compact-numeral',
        textContent: text,
      }),
    );
  };

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
      const column = document.createElement('div');
      column.className = 'z1r-compact-column';

      /*
       * The level's Triforce piece, as the column's own heading.
       *
       * It used to be a separate panel holding a drawn triangle — 181px for
       * eight booleans that are already one per group here. The triangle still
       * earns that space on the stream overlay, where it is the thing viewers
       * read; in a dock it was paying rent to say what a row of toggles says.
       *
       * Levels 1-8 only. Level 9 holds Ganon and has no piece, and the
       * overworld column is not a level at all — both keep the heading box so
       * the slot rows stay aligned, but neither is a control.
       */
      const level = /^L([1-9])$/.exec(label)?.[1];
      if (level && Number(level) <= TRIFORCE_REQUIRED_FOR_L9) {
        const piece = document.createElement('button');
        piece.type = 'button';
        piece.className = 'z1r-compact-head';
        piece.disabled = !interactive;
        appendNumberedTriangle(piece, level);
        if (interactive) {
          piece.addEventListener('click', () =>
            store.dispatch({
              type: 'setDungeon',
              level: Number(level),
              patch: {
                triforce: !(store.getState().dungeons[level]?.triforce ?? false),
              },
            }),
          );
        }
        slotPatches.push((s2) => {
          const held = s2.dungeons[level]?.triforce ?? false;
          // Held reads as solid border and a full-strength triangle, unheld as
          // dashed, gray and dimmed — the same two channels the item chips use,
          // neither of them color. The numeral stays legible either way; see
          // the contrast note in styles.css.
          piece.dataset.on = String(held);
          piece.title = `Level ${level} Triforce piece — ${held ? 'collected' : 'not collected'}`;
          piece.setAttribute('aria-pressed', String(held));
          piece.setAttribute('aria-label', piece.title);
        });
        column.append(piece);
      } else {
        const head = document.createElement('span');
        head.className = 'z1r-compact-head z1r-compact-head-plain';
        head.textContent = level ?? label;
        head.title = level ? `Level ${level} — Ganon, no Triforce piece` : 'Overworld locations';
        column.append(head);
      }

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
        column.append(slot);

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
            else face.textContent = slotCode(location);
          });
        });
      }
      body.append(column);
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
