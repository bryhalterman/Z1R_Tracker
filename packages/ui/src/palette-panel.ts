import {
  ROOM_ITEMS_BY_ID,
  SCREEN_ITEMS_BY_ID,
  type SpriteResolver,
  type Store,
  type TrackerState,
} from '@z1r/core';
import { placedIndex } from './placed.js';
import { mountItemPalette, targetFor } from './palette/mount.js';
import { mountHelpTip } from './panel/mount.js';
import type { Patch } from './patch.js';
import type { PlacementChannel } from './rooms.js';
import { el, section } from './dom.js';

/**
 * The Items panel on the page: an always-on placement palette.
 *
 * The section, its heading and the line saying what the next click does stay
 * plain DOM, so folding and the Items card's nesting work as they do for every
 * panel. The tiles and the tier popover are React — see `palette/`.
 *
 * Only the page builds this; the OBS dock and overlay keep the inventory grid.
 */
export function buildPalette(
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
  const { placement, placeInto, itemSize } = opts;
  const { root, body } = section('Items', 'z1r-palette');
  root.style.setProperty('--z1r-item-min', `${itemSize + 10}px`);
  const heading = root.querySelector('.z1r-panel-title');

  /*
   * How the palette works, and what is armed, behind a ? at the end of the
   * heading rather than as a line under it, so the column spends no height on
   * instructions. On screen the armed tile's thicker ring says what is armed;
   * a hidden live region says it in words to a screen reader.
   */
  const helpHost = el('span', 'z1r-heading-helphost');
  heading?.append(helpHost);
  const help = mountHelpTip(helpHost);
  const status = el('span', 'z1r-visually-hidden');
  status.setAttribute('aria-live', 'polite');
  heading?.append(status);

  const palette = mountItemPalette(body);
  const arm = (item: string) => placement.set({ item });
  const step = (id: string, direction: 1 | -1) => store.dispatch({ type: 'cycleItem', id, direction });
  const setHeld = (id: string, value: number) => store.dispatch({ type: 'setItem', id, value });

  /*
   * A drag arms the item for as long as it is in the air, so the room sheet
   * and the map show what will take it the way they do for a right-click arm,
   * and the drop lands through the same click handlers. Dropped somewhere,
   * the landing has already put it down; dropped nowhere, whatever was armed
   * before the drag is armed again.
   */
  let beforeDrag = '';
  const dragStart = (item: string) => {
    beforeDrag = placement.get().item;
    placement.set({ item });
  };
  const dragEnd = (dropped: boolean) => {
    if (!dropped) placement.set({ item: beforeDrag });
    beforeDrag = '';
  };

  const draw = (state: TrackerState) => {
    const armed = placement.get().item;
    // Either list: the overworld-only items are not room items.
    const def = armed ? (ROOM_ITEMS_BY_ID.get(armed) ?? SCREEN_ITEMS_BY_ID.get(armed)) : undefined;
    root.dataset.armed = String(!!def);
    const armedLine = def
      ? `${def.name} armed — click ${targetFor(def.id, placeInto)}. Esc puts it down.`
      : '';
    status.textContent = armedLine;
    help.render({
      label: 'How to use Items',
      lines: [
        ...(armedLine ? [armedLine] : []),
        'Drag an item onto a room, an overworld screen, or the room card to place it.',
        'Or right-click an item to arm it, then click where you found it. Esc puts it down.',
        'Click an item to mark it held.',
      ],
    });
    palette.render({
      state,
      armed,
      placedAt: placedIndex(state),
      resolver,
      itemSize,
      placeInto,
      arm,
      setHeld,
      step,
      dragStart,
      dragEnd,
    });
  };

  patches.push(draw);
  // Arming changes nothing in the store, so the channel drives its own redraw.
  placement.watch(() => draw(store.getState()));

  return root;
}
