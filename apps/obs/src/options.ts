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
 * Sections the OBS build offers, in dock order.
 *
 * The overworld grid is deliberately absent. It's 128 cells and a region code
 * on each — far too busy to read in a dock beside a stream, and pointless on
 * an overlay. Overworld tracking lives in the web and desktop apps, which have
 * the room for it.
 */
export const OBS_SECTIONS: readonly TrackerSection[] = [
  'seed',
  'items',
  'dungeons',
  'locations',
  'hintlog',
];

/**
 * Keeps `?sections=` honest — an unknown or excluded name is dropped.
 *
 * Falls back to the full set rather than returning empty: a typo, an empty
 * value, or asking only for the excluded map would otherwise render a blank
 * browser source, which looks identical to the tracker being broken.
 */
export function allowedSections(requested: readonly string[]): readonly TrackerSection[] {
  const allowed = requested.filter((name): name is TrackerSection =>
    OBS_SECTIONS.includes(name as TrackerSection),
  );
  return allowed.length ? allowed : OBS_SECTIONS;
}
