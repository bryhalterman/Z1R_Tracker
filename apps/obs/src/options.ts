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
