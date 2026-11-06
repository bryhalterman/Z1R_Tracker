/**
 * The action that toggles a filled slot's collected flag.
 *
 * Shared by the overlay's plain-DOM chips and the dock's React chips, which
 * used to carry identical copies.
 */

import type { Action, ItemPlacement } from '@z1r/core';

/**
 * A slot is a view of a placement, so collecting one is collecting the room or
 * screen behind it — `source` says which. An entry an older save holds directly
 * goes through `collectLocation` under its own id, because that entry is the
 * only place its flag lives; that is also how a former extra floor slot, shown
 * as overflow with no slot of its own, is collected. An empty slot has nothing
 * to collect: null.
 */
export function collectAction(placement: ItemPlacement | null): Action | null {
  if (!placement) return null;
  const collected = !placement.collected;
  const source = placement.source;
  switch (source.kind) {
    case 'room':
      return { type: 'collectRoom', level: source.level, room: source.room, collected };
    case 'screen':
      return { type: 'collectScreen', screen: source.screen, collected };
    case 'stored':
      return { type: 'collectLocation', id: source.id, collected };
  }
}
