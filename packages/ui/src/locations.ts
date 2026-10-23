/**
 * Item location tracking.
 *
 * The point of this panel in a randomizer run is to answer "where did that
 * come from, and what's left unchecked". Slots are derived from the seed
 * settings rather than stored, so switching Dungeon Quest reshapes the list —
 * see `deriveLocations`.
 *
 * Read-only on the page. Every slot is filled from a placement on a map — a
 * room's item lands in its level's floor, stair or boss-drop slot, an overworld
 * screen's item in the named spot it carries — through `deriveItemLocations`.
 * Writing the same fact in two places is how the two used to disagree, so to
 * change this panel you change the map.
 */

import {
  SCREEN_ITEMS_BY_ID,
  TRIFORCE_REQUIRED_FOR_L9,
  canEnterLevel9,
  deriveItemLocations,
  triforceCount,
  type ItemLocations,
  type ItemPlacement,
  type LocationDef,
  type SpriteResolver,
  type Store,
  type TrackerState,
} from '@z1r/core';
import { createSprite } from './sprite.js';
import { memoise, runPatches, type Patch } from './patch.js';

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

/** Where a slot's item was read from, phrased for a tooltip. */
function sourceText(placement: ItemPlacement): string {
  const source = placement.source;
  if (source.kind === 'room') return `placed in L${source.level} ${source.room}`;
  if (source.kind === 'screen') return `placed on overworld ${source.screen}`;
  return 'recorded in an older save';
}

/**
 * Toggle a filled slot's collected flag on whatever it was read from.
 *
 * A slot is a view of a placement, so collecting one is collecting the room or
 * the screen behind it — `source` says which. Only a slot an older save holds
 * directly goes through `collectLocation`, because that entry is the only place
 * its flag lives. An empty slot has nothing to collect and does nothing.
 */
function toggleCollected(store: Store, location: LocationDef | null, placement: ItemPlacement | null): void {
  if (!placement) return;
  const collected = !placement.collected;
  const source = placement.source;
  if (source.kind === 'room') {
    store.dispatch({ type: 'collectRoom', level: source.level, room: source.room, collected });
  } else if (source.kind === 'screen') {
    store.dispatch({ type: 'collectScreen', screen: source.screen, collected });
  } else if (location) {
    store.dispatch({ type: 'collectLocation', id: location.id, collected });
  }
}

/**
 * Which slots and overflow chips the panel draws, as one string.
 *
 * Overflow is part of the shape: a room item placed past its level's slots adds
 * a chip, and the panel rebuilds for that rather than keeping spare nodes.
 */
function shapeOf(state: TrackerState, derived: ItemLocations): string {
  const overflow = [...derived.overflow.entries()].map(([level, list]) => `${level}x${list.length}`);
  return [
    derived.slots.map((slot) => slot.location.id).join('|'),
    overflow.join(','),
    derived.overworldOverflow.length,
    state.seed.shuffleMinorDrops,
  ].join('::');
}

/** The level groups in listed order, keyed `L1`-`L9` and `OW`. */
function groupSlots(derived: ItemLocations): Map<string, LocationDef[]> {
  const groups = new Map<string, LocationDef[]>();
  for (const { location } of derived.slots) {
    const key = location.level === undefined ? 'OW' : `L${location.level}`;
    const list = groups.get(key);
    if (list) list.push(location);
    else groups.set(key, [location]);
  }
  return groups;
}

/** Overflow chips for one group: a level's spilled room items, or the overworld's. */
function overflowFor(derived: ItemLocations, level: number | undefined): readonly ItemPlacement[] {
  return level === undefined ? derived.overworldOverflow : (derived.overflow.get(level) ?? []);
}

/** The slot kind an overflow chip is drawn as. */
function overflowKind(placement: ItemPlacement): string {
  return 'kind' in placement && typeof placement.kind === 'string' ? placement.kind : 'overworld';
}

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

  const rows = document.createElement('div');
  rows.className = 'z1r-loc-rows';
  root.append(rows);

  /** The derivation for the pass in progress, read by every slot's patch. */
  let derived: ItemLocations = deriveItemLocations(store.getState());

  // Rebuilding is driven by the *shape* of what is drawn, not by every state
  // change — the slots themselves patch in place.
  let renderedSignature = '';
  const slotPatches: Patch[] = [];

  const rebuild = (state: TrackerState) => {
    rows.replaceChildren();
    slotPatches.length = 0;

    const groups = groupSlots(derived);
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
        block.append(
          buildSlot(resolver, location.kind, slotPatches, () => ({
            location,
            placement: derived.byId.get(location.id) ?? null,
          })),
        );
      }

      /*
       * Placements past this group's slots, after them on the same line.
       *
       * Shown rather than refused: the slot counts are a default quest's, and a
       * seed can hold more. Read by index on each pass, because the shape
       * signature above guarantees the count has not moved under them.
       */
      overflowFor(derived, level).forEach((first, index) => {
        block.append(
          buildSlot(resolver, overflowKind(first), slotPatches, () => ({
            location: null,
            placement: overflowFor(derived, level)[index] ?? null,
          })),
        );
      });

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

    /*
     * How tall the first column runs before the next one starts.
     *
     * The layout is two columns filled downwards, and CSS can only fill a grid
     * column-first against an explicit row count — there is no `auto-fill` in
     * the block direction. The count has to come from here because the groups
     * are derived from the seed settings: a default seed gives ten (L1-L9 and
     * OW), and a setting that drops a level's only slot gives nine.
     *
     * Two columns rather than a number scaled to the width: the panel is
     * sizing itself to sit beside the Triforce in one row, and a third column
     * would make it wider than that to save one line of height.
     */
    // Floored at 1: `repeat(0, auto)` is not a valid track list, and an
    // invalid value here would drop the row count and lay all ten out in a
    // single row.
    rows.style.setProperty('--z1r-loc-rows', String(Math.max(1, Math.ceil(groups.size / 2))));
  };

  patches.push((state) => {
    derived = deriveItemLocations(state);
    const signature = shapeOf(state, derived);
    renderedSignature = memoise(renderedSignature, signature, () => rebuild(state)) ?? '';
    runPatches(slotPatches, state);

    const collected = derived.slots.filter((slot) => slot.placement?.collected).length;
    summary.textContent = `${collected}/${derived.slots.length}`;
  });

  return root;
}

/**
 * One 24px box: what is known to be here, and whether it has been picked up.
 *
 * Display only. It is a plain element rather than a button so it neither takes
 * focus nor looks like a thing to press; the facts it shows are changed on the
 * maps, and the whole of what it says is in its label as words.
 *
 * `location` is null for an overflow chip, which belongs to no listed slot.
 */
function buildSlot(
  resolver: SpriteResolver,
  kind: string,
  patches: Patch[],
  read: () => { location: LocationDef | null; placement: ItemPlacement | null },
): HTMLElement {
  const { location } = read();
  const slot = document.createElement('span');
  slot.className = 'z1r-loc-slot';
  slot.setAttribute('role', 'img');
  if (location) slot.dataset.slot = location.id;
  else slot.dataset.overflow = 'true';
  slot.dataset.kind = kind;
  slot.dataset.known = 'false';
  slot.dataset.collected = 'false';

  const face = document.createElement('span');
  face.className = 'z1r-loc-face';
  slot.append(face);

  let renderedFace: string | null = null;
  patches.push(() => {
    const { placement } = read();
    const entry = placement?.item ? SCREEN_ITEMS_BY_ID.get(placement.item) : undefined;
    const collected = !!placement?.collected;
    slot.dataset.known = String(!!entry);
    slot.dataset.collected = String(collected);

    const where = location ? location.label : `Extra ${KIND_TITLE[kind]?.toLowerCase() ?? kind}`;
    const about = location
      ? (location.note ?? KIND_TITLE[location.kind] ?? location.kind)
      : 'more than this level has slots for';
    // Every state in words as well as in the border and the tick: this is what
    // a screen reader is given, and the text channel is the one that does not
    // depend on seeing the difference between a dashed and a solid edge.
    slot.title =
      `${where} — ${entry ? entry.name : 'nothing recorded'}` +
      ` — ${collected ? 'picked up' : 'not picked up'}` +
      (placement ? ` — ${sourceText(placement)}` : '') +
      ` (${about})`;
    slot.setAttribute('aria-label', slot.title);

    const faceKey = entry ? `item:${entry.sprite}` : `kind:${kind}`;
    renderedFace = memoise(renderedFace, faceKey, () => {
      if (entry) {
        face.replaceChildren(createSprite(resolver, entry.sprite, { size: SLOT_ART, label: '' }));
        return;
      }
      if (kind === 'stair') {
        face.replaceChildren(
          createSprite(resolver, 'mark.stairway', { size: SLOT_GLYPH_ART, label: '' }),
        );
        return;
      }
      face.replaceChildren();
      face.textContent = KIND_GLYPH[kind] ?? '?';
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

function slotCode(kind: string, location: LocationDef | null): string {
  return (location ? SPOT_CODE[location.id] : undefined) ?? KIND_INITIAL[kind] ?? '?';
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
 *
 * It reads the same derivation as the page, so the two never disagree about
 * what is where. Which item is in a slot is set on the maps, not here; what a
 * chip still does is toggle collected, on whichever room or screen it was read
 * from.
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

  /** The derivation for the pass in progress, read by every chip's patch. */
  let derived: ItemLocations = deriveItemLocations(store.getState());

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

  /** One chip. `read` is called on every pass, so the chip follows the maps. */
  const buildChip = (
    kind: string,
    read: () => { location: LocationDef | null; placement: ItemPlacement | null },
  ): HTMLElement => {
    const { location } = read();
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'z1r-compact-slot';
    slot.dataset.kind = kind;
    if (!location) slot.dataset.overflow = 'true';
    slot.disabled = !interactive;
    if (interactive) {
      const toggle = () => {
        const now = read();
        toggleCollected(store, now.location, now.placement);
      };
      // Either button toggles collected. The left click used to open an item
      // picker, which is gone with item assignment here; the right click is
      // kept because it is the gesture this chip has always had for it.
      slot.addEventListener('click', toggle);
      slot.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        toggle();
      });
    }

    const face = document.createElement('span');
    face.className = 'z1r-compact-face';
    slot.append(face);

    let renderedItem: string | null = null;
    slotPatches.push(() => {
      const { placement } = read();
      const item = placement?.item ?? '';
      const collected = !!placement?.collected;
      slot.dataset.collected = String(collected);
      slot.dataset.known = String(!!item);
      const entry = item ? SCREEN_ITEMS_BY_ID.get(item) : undefined;
      const where = location ? location.label : `Extra ${KIND_TITLE[kind]?.toLowerCase() ?? kind}`;
      slot.title =
        `${where} — ${entry?.name ?? 'unknown'}` +
        `${collected ? ' (collected)' : ''}` +
        (placement ? '' : ' — place it on a map to record it');
      renderedItem = memoise(renderedItem, item, () => {
        if (entry) face.replaceChildren(createSprite(resolver, entry.sprite, { size: 16 }));
        else face.replaceChildren(slotCode(kind, location));
      });
    });

    return slot;
  };

  const rebuild = () => {
    body.replaceChildren();
    slotPatches.length = 0;

    for (const [label, list] of groupSlots(derived)) {
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
        column.append(
          buildChip(location.kind, () => ({
            location,
            placement: derived.byId.get(location.id) ?? null,
          })),
        );
      }

      const groupLevel = list[0]?.level;
      overflowFor(derived, groupLevel).forEach((first, index) => {
        column.append(
          buildChip(overflowKind(first), () => ({
            location: null,
            placement: overflowFor(derived, groupLevel)[index] ?? null,
          })),
        );
      });

      body.append(column);
    }
  };

  patches.push((state) => {
    derived = deriveItemLocations(state);
    const signature = shapeOf(state, derived);
    renderedSignature = memoise(renderedSignature, signature, rebuild) ?? '';
    runPatches(slotPatches, state);
    const collected = derived.slots.filter((slot) => slot.placement?.collected).length;
    summary.textContent = `${collected}/${derived.slots.length}`;
  });

  return root;
}
