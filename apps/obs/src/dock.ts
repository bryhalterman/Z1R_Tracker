/**
 * OBS Custom Browser Dock entry point.
 *
 * This is the half you click. Edits land in localStorage and are broadcast to
 * the overlay in the same OBS instance, so both windows must be loaded from
 * the *same origin* — see docs/OBS.md.
 */

import {
  DOCK_SECTIONS,
  attachPersistence,
  createInitialState,
  createStore,
  load,
  loadResolver,
} from './options.js';
import { mountControls, mountTracker } from '@z1r/ui';
import '@z1r/ui/styles.css';
import './obs.css';

async function main(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#tracker');
  const controls = document.querySelector<HTMLElement>('#controls');
  if (!root || !controls) throw new Error('Dock mount points are missing.');

  const store = createStore(load() ?? createInitialState());
  attachPersistence(store);

  const resolver = await loadResolver(new URL('sprites.json', document.baseURI).href);

  /*
   * Stamp the build into the footnote.
   *
   * A Custom Browser Dock has no "Refresh cache of current page" — that button
   * exists only on Browser Sources — so a dock can go on serving a cached copy
   * across OBS restarts with nothing on screen to say so. Chasing a rendering
   * bug that had already been fixed is exactly what that costs, so the dock now
   * says which build it is running.
   */
  mountControls(controls, {
    store,
    footnote: `Browser source: overlay.html · build ${__BUILD_ID__}`,
  });
  mountTracker(root, { store, resolver, itemSize: 34, sections: DOCK_SECTIONS, compact: true });
}

void main();
