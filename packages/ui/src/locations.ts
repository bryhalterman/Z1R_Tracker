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
} from '@z1r/core';
import { createSprite } from './sprite.js';
import { memoise, runPatches, type Patch } from './patch.js';
import { mountCompactLocations } from './locations/mount.js';
import { slotCode, slotText } from './locations/slot-words.js';

/**
 * Which slots and overflow chips the panel draws, as one string.
 *
 * Overflow is part of the shape: a room item placed past its level's slots adds
 * a chip, and the panel rebuilds for that rather than keeping spare nodes.
 */
function shapeOf(derived: ItemLocations): string {
  const overflow = [...derived.overflow.entries()].map(([level, list]) => `${level}x${list.length}`);
  return [
    derived.slots.map((slot) => slot.location.id).join('|'),
    overflow.join(','),
    derived.overworldOverflow.length,
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

/**
 * The Locations panel: a column per level, headed by its Triforce piece.
 *
 * Every mount uses the compact form — the page and the desktop build in the
 * Items card, the OBS dock and the overlay on their own. A full-width form
 * with a row per slot existed before the Items card, and no mount reached it
 * any more.
 */
export function buildLocations(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
  /** One row per level rather than one column — the page's left column. */
  rows = false,
): HTMLElement {
  return buildCompactLocations(store, resolver, patches, interactive, rows);
}

/**
 * Dense variant for the page's Items card, the OBS dock and the overlay.
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
  rows: boolean,
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

  /*
   * Where the panel can be clicked — the page's Items card and the OBS dock —
   * the columns are React (`locations/`). The read-only overlay keeps the
   * plain-DOM columns below: they draw synchronously, and the overlay sizes
   * itself from its first paint.
   */
  if (interactive) {
    const host = document.createElement('div');
    root.append(host);
    const columns = mountCompactLocations(host);
    patches.push((state) => {
      const derived = deriveItemLocations(state);
      const collected = derived.slots.filter((slot) => slot.placement?.collected).length;
      summary.textContent = `${collected}/${derived.slots.length}`;
      columns.render({ state, resolver, dispatch: store.dispatch, rows });
    });
    return root;
  }

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
    // Only the read-only overlay draws these; the clickable chips are React.
    slot.disabled = true;

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
      slot.title = slotText(kind, location, placement, entry?.name);
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
        piece.disabled = true;
        appendNumberedTriangle(piece, level);
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
    const signature = shapeOf(derived);
    renderedSignature = memoise(renderedSignature, signature, rebuild) ?? '';
    runPatches(slotPatches, state);
    const collected = derived.slots.filter((slot) => slot.placement?.collected).length;
    summary.textContent = `${collected}/${derived.slots.length}`;
  });

  return root;
}
