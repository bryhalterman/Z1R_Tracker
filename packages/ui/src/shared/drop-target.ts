/**
 * Handlers that make an element a target for a palette drag: the map and room
 * cells, and the room card.
 *
 * A drag lands like a click with the item armed: starting the drag armed it,
 * so `land` is the same handler a click calls. `canDrop` says whether anything
 * armed can go here at all; while it says no, the element does not accept the
 * drag and the browser shows the no-drop cursor.
 *
 * Entering is accepted as well as hovering, which is what the drag-and-drop
 * model asks of a drop target. `onAccept` and `onLeave` are for a target that
 * highlights while a drag is over it, as the room card does.
 */

import type { DragEvent } from 'react';

export interface DropHooks {
  onAccept?: () => void;
  onLeave?: () => void;
}

export function dropTarget(canDrop: () => boolean, land: () => void, hooks: DropHooks = {}) {
  const accept = (event: DragEvent) => {
    if (!canDrop()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    hooks.onAccept?.();
  };
  return {
    onDragEnter: accept,
    onDragOver: accept,
    onDragLeave: (event: DragEvent) => {
      // Moving between the target's own children fires a leave as well.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hooks.onLeave?.();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      hooks.onLeave?.();
      land();
    },
  };
}
