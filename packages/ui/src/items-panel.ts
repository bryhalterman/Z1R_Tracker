import {
  ITEMS,
  labelFor,
  maxValue,
  spriteFor,
  type ItemDef,
  type SpriteResolver,
  type Store,
} from '@z1r/core';
import { createSprite } from './sprite.js';
import { placedIndex, placedSuffix } from './placed.js';
import { mountDockItems } from './items/mount.js';
import { memoise, runPatches, type Patch } from './patch.js';
import { roomItemsForInventory } from './rooms.js';
import { el, section } from './dom.js';

/**
 * The inventory, as the OBS dock and overlay show it.
 *
 * On the dock a click raises an item and Shift+click or a right click lowers
 * it — that grid is React, see `items/`. The overlay's is plain DOM and takes
 * no clicks. The page builds `buildPalette` in their place.
 */
export function buildItems(
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
