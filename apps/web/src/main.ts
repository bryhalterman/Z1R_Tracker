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
  /*
   * Seed and Hints start folded on the page.
   *
   * Both are entered once and then read rarely — the seed settings are set
   * before the run and the hint log is empty until a hint is heard — and
   * between them they were costing a third of the first screen. Folded only
   * until this browser saves a folded set of its own, so someone who opens
   * Seed finds it open next time.
   */
  mountTracker(trackerRoot, {
    store,
    resolver,
    defaultCollapsed: ['Seed', 'Hints'],
    // Small enough to sit beside the panels it shares a column with. The
    // inventory is scanned for what is missing, not studied, and the art is
    // 16px of NES sprite however large the cell around it is.
    itemSize: 24,
  });
}

void main();
