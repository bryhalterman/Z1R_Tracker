import { bootTracker } from '@z1r/core';
import { mountControls, mountTracker } from '@z1r/ui';
import '@z1r/ui/styles.css';
import './app.css';

async function main(): Promise<void> {
  const trackerRoot = document.querySelector<HTMLElement>('#tracker');
  const controlsRoot = document.querySelector<HTMLElement>('#controls');
  if (!trackerRoot || !controlsRoot) throw new Error('Tracker mount points are missing.');

  // A `sprites.json` beside index.html wins over the bundled manifest, so an
  // art pack can be swapped by editing one file on the Pages branch.
  const { store, resolver } = await bootTracker({
    spritesUrl: new URL('sprites.json', document.baseURI).href,
  });

  mountControls(controlsRoot, { store, mapsToggle: true });
  // The seed settings and the hint log open from the toolbar's sheets, so no
  // panel needs to start folded.
  mountTracker(trackerRoot, {
    store,
    resolver,
    // Small enough to sit beside the panels it shares a column with. The
    // inventory is scanned for what is missing, not studied, and the art is
    // 16px of NES sprite however large the cell around it is.
    itemSize: 16,
    mapsLayout: true,
  });
}

void main();
