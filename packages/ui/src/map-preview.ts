/**
 * "Show me where that is on the map", from any panel.
 *
 * A control that names something the overworld map holds — the start brush, a
 * dungeon number in the screen card, the Levels heading or the Locations
 * Triforce heads — can point the map at it while hovered or focused. The map
 * dims every other screen and rings the match.
 *
 * Sent as a DOM event from the control itself, so the panels need no handle on
 * the map: the map listens on the document and only answers events raised
 * inside its own tracker, which keeps two trackers on one page apart.
 */

export type MapPreview = { kind: 'start' } | { kind: 'dungeon'; level: number } | null;

export const MAP_PREVIEW_EVENT = 'z1r:map-preview';

/** Point the map at `preview`, or let go with `null`. */
export function previewOnMap(from: EventTarget, preview: MapPreview): void {
  from.dispatchEvent(new CustomEvent<MapPreview>(MAP_PREVIEW_EVENT, { bubbles: true, detail: preview }));
}

/**
 * The four handlers a control needs: pointer and keyboard focus both point,
 * and leaving either lets go.
 */
export function previewHandlers(preview: Exclude<MapPreview, null>) {
  return {
    onPointerEnter: (event: { currentTarget: EventTarget }) => previewOnMap(event.currentTarget, preview),
    onPointerLeave: (event: { currentTarget: EventTarget }) => previewOnMap(event.currentTarget, null),
    onFocus: (event: { currentTarget: EventTarget }) => previewOnMap(event.currentTarget, preview),
    onBlur: (event: { currentTarget: EventTarget }) => previewOnMap(event.currentTarget, null),
  };
}
