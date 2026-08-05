/**
 * OBS Custom Browser Dock entry point.
 *
 * This is the half you click. Edits land in localStorage and are broadcast to
 * the overlay in the same OBS instance, so both windows must be loaded from
 * the *same origin* — see docs/OBS.md.
 */

import {
  OBS_SECTIONS,
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

  mountControls(controls, { store, footnote: 'Browser source: index.html' });
  mountTracker(root, { store, resolver, itemSize: 34, sections: OBS_SECTIONS });
}

void main();
