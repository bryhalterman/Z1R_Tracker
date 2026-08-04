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

/** file:// has no service workers and no fetch; say so instead of failing quietly. */
const isFileProtocol = window.location.protocol === 'file:';

async function main(): Promise<void> {
  const trackerRoot = document.querySelector<HTMLElement>('#tracker');
  const controlsRoot = document.querySelector<HTMLElement>('#controls');
  if (!trackerRoot || !controlsRoot) throw new Error('Tracker mount points are missing.');

  const store = createStore(load() ?? createInitialState('z1r'));
  attachPersistence(store);

  // Over file:// the fetch always fails, so skip it and use the bundled manifest.
  const resolver = isFileProtocol
    ? await loadResolver('')
    : await loadResolver(new URL('sprites.json', document.baseURI).href);

  mountControls(controlsRoot, { store });
  mountTracker(trackerRoot, { store, resolver });

  const note = document.querySelector<HTMLElement>('#mode-note');
  if (note && isFileProtocol) {
    note.textContent =
      'Left click adds, right click removes. Running from a local file — run start.cmd for offline sprite caching.';
  }

  if (!isFileProtocol && 'serviceWorker' in navigator) {
    // Caches remote sprite art so a run survives losing the network mid-stream.
    void navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href, { scope: './' })
      .catch(() => {
        /* Offline caching is a bonus, not a requirement. */
      });
  }
}

void main();
