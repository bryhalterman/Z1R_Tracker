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
 * The overworld map is *not* here. It wants to be large and to stay put, and
 * sharing this column meant it was either squeezed narrow or reached by
 * scrolling past everything else. It has `map.html` to itself, docked wherever
 * there is room, sharing this store through localStorage and a BroadcastChannel.
 */
export const DOCK_SECTIONS: readonly TrackerSection[] = [
  'seed',
  'items',
  'dungeons',
  'locations',
  'hintlog',
];

/** The standalone map dock: one panel, given the whole window. */
export const MAP_SECTIONS: readonly TrackerSection[] = ['map'];

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
 * Keeps `?sections=` honest — an unknown name is dropped.
 *
 * Falls back to the default rather than returning empty: a typo or an empty
 * value would otherwise render a blank browser source, which looks identical
 * to the tracker being broken.
 */
export function allowedSections(requested: readonly string[]): readonly TrackerSection[] {
  // Deliberately checked against the dock's list, which no longer includes the
  // map: 128 screens with a two-letter code on each is unreadable as a static
  // overlay, and it has its own window now for when you want to read it.
  const allowed = requested.filter((name): name is TrackerSection =>
    DOCK_SECTIONS.includes(name as TrackerSection),
  );
  return allowed.length
    ? allowed
    : (OVERLAY_DEFAULT_SECTIONS.split(',') as TrackerSection[]);
}
