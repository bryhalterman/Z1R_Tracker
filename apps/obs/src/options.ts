/**
 * Re-export shim.
 *
 * The overlay and dock both want core plus the `TrackerSection` type, and
 * pulling the type from `@z1r/ui` while pulling values from `@z1r/core` in
 * every entry file got noisy. One import site, one place to change.
 */

export {
  attachPersistence,
  createInitialState,
  createStore,
  load,
  loadResolver,
} from '@z1r/core';

export type { TrackerSection as TrackerSectionName } from '@z1r/ui';

import type { TrackerSection } from '@z1r/ui';

/**
 * Everything the dock carries.
 *
 * It lives inside OBS and is never on camera, so it needs full tracking
 * capability — anything missing here would force you out to another window
 * mid-run. It renders in the compact layout because a dock is narrow, not
 * because anything is left out.
 *
 * The overworld map is *not* here, and neither is the hint log. The map wants to
 * be large and to stay put, and a hint's whole payoff is the screens it lights
 * up on that map — reading one here meant looking away from the answer. Both
 * live in `map.html`, sharing this store through localStorage and a
 * BroadcastChannel.
 */
export const DOCK_SECTIONS: readonly TrackerSection[] = ['items', 'locations'];

/**
 * The map dock: the overworld, and the hints that point at it.
 *
 * A hint names a region and its whole payoff is the screens lighting up, so
 * reading one on a different window from the map it highlights meant looking
 * away from the answer to type the question. They travel together.
 */
export const MAP_SECTIONS: readonly TrackerSection[] = ['seed', 'hintlog', 'map'];

/**
 * What the overlay shows unless asked otherwise.
 *
 * This is the half that sits over the game capture, which is the premium space
 * on a stream — so it defaults to the two panels a viewer actually reads at a
 * glance. Any other section can still be requested by name; the default is
 * simply the restrained one.
 */
export const OVERLAY_DEFAULT_SECTIONS = 'items,dungeons';

/**
 * What `?sections=` may ask for.
 *
 * Its own list rather than the dock's. It was checked against `DOCK_SECTIONS`,
 * which silently coupled the two: the moment the Triforce panel left the dock,
 * the overlay stopped accepting `dungeons` and dropped the triangle from every
 * stream that asked for it.
 *
 * Everything except the map. 128 screens carrying marks and codes is worth
 * reading in a window you can size and pointless as a static graphic over a
 * game capture; it has its own dock for that.
 */
export const OVERLAY_ALLOWED_SECTIONS: readonly TrackerSection[] = [
  'seed',
  'items',
  'dungeons',
  'locations',
  'hintlog',
];

/**
 * Keeps `?sections=` honest — an unknown name is dropped.
 *
 * Falls back to the default rather than returning empty: a typo or an empty
 * value would otherwise render a blank browser source, which looks identical
 * to the tracker being broken.
 */
export function allowedSections(requested: readonly string[]): readonly TrackerSection[] {
  const allowed = requested.filter((name): name is TrackerSection =>
    OVERLAY_ALLOWED_SECTIONS.includes(name as TrackerSection),
  );
  return allowed.length
    ? allowed
    : (OVERLAY_DEFAULT_SECTIONS.split(',') as TrackerSection[]);
}
