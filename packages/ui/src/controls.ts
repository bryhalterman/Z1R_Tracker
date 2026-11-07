/**
 * Toolbar: the seed settings, the hint log, reset, and save file import/export.
 *
 * Kept out of `tracker.ts` because the OBS browser source renders the tracker
 * without any of it — viewers should never see a Reset button. The bar itself
 * is React — see `toolbar/`.
 */

import type { Store } from '@z1r/core';
import { mountToolbar } from './toolbar/mount.js';

export interface ControlsOptions {
  readonly store: Store;
  /** Shown next to the toolbar; used for the OBS browser-source URL hint. */
  readonly footnote?: string;
  /** Offer the Overworld / Levels layout choice — see `mapsLayout` on `mountTracker`. */
  readonly mapsToggle?: boolean;
}

export function mountControls(root: HTMLElement, options: ControlsOptions): () => void {
  root.classList.add('z1r-controls');
  root.replaceChildren();
  const unmount = mountToolbar(root, {
    store: options.store,
    footnote: options.footnote,
    mapsToggle: options.mapsToggle,
  });
  return () => {
    unmount();
    root.replaceChildren();
  };
}
