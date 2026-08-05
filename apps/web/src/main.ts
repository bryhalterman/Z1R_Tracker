import {
  attachPersistence,
  createInitialState,
  createStore,
  load,
  loadResolver,
} from '@z1r/core';
import { mountControls, mountTracker } from '@z1r/ui';
import '@z1r/ui/styles.css';
import './app.css';

async function main(): Promise<void> {
  const trackerRoot = document.querySelector<HTMLElement>('#tracker');
  const controlsRoot = document.querySelector<HTMLElement>('#controls');
  if (!trackerRoot || !controlsRoot) throw new Error('Tracker mount points are missing.');

  // A run in progress must survive a refresh — restore before the first paint.
  const store = createStore(load() ?? createInitialState());
  attachPersistence(store);

  // A `sprites.json` beside index.html wins over the bundled manifest, so an
  // art pack can be swapped by editing one file on the Pages branch.
  const resolver = await loadResolver(new URL('sprites.json', document.baseURI).href);

  mountControls(controlsRoot, { store });
  mountTracker(trackerRoot, { store, resolver });
}

void main();
