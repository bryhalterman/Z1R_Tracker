/**
 * Standalone overworld map dock.
 *
 * The map is the one panel that wants to be big and wants to stay put. Sharing
 * a dock with the seed form, the inventory and the location list meant it was
 * either squeezed into a narrow column or reached by scrolling past everything
 * else — mid-run, which is exactly when neither is acceptable.
 *
 * Split out, it can be docked on its own edge of the OBS window, sized to
 * whatever the screens deserve, and left alone. It shares the same store as the
 * main dock through localStorage and a BroadcastChannel, so marking a screen
 * here shows up there and on the overlay at once.
 */

import {
  MAP_SECTIONS,
  attachPersistence,
  createInitialState,
  createStore,
  load,
  loadResolver,
} from './options.js';
import { mountTracker } from '@z1r/ui';
import '@z1r/ui/styles.css';
import './obs.css';

async function main(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#tracker');
  if (!root) throw new Error('Map mount point is missing.');

  const store = createStore(load() ?? createInitialState());
  attachPersistence(store);

  const resolver = await loadResolver(new URL('sprites.json', document.baseURI).href);

  /*
   * No Export/Import/Reset bar here. They exist in the main dock, and a second
   * Reset button on a window whose whole job is one panel is a way to lose a
   * run by misclick rather than a convenience.
   *
   * `compact: false` on purpose, unlike the main dock: this window is not
   * narrow, so the map gets the roomier layout.
   */
  mountTracker(root, { store, resolver, sections: MAP_SECTIONS, compact: false });
}

void main();
