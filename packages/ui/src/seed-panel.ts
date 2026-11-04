/**
 * Seed and settings panel.
 *
 * The section and its title stay plain DOM, so panel collapsing and the page
 * layouts that place `.z1r-seed` work as they do for every other panel. The
 * form inside is React — see `seed-form/`.
 */

import type { SeedSettings, Store } from '@z1r/core';
import type { Patch } from './patch.js';
import { mountSeedForm } from './seed-form/mount.js';

export function buildSeedPanel(store: Store, patches: Patch[], interactive: boolean): HTMLElement {
  const root = document.createElement('section');
  root.className = 'z1r-panel z1r-seed';
  const title = document.createElement('h2');
  title.className = 'z1r-panel-title';
  title.textContent = 'Seed';
  root.append(title);

  const body = document.createElement('div');
  body.className = 'z1r-seed-body';
  root.append(body);

  const set = (patch: Partial<SeedSettings>) => store.dispatch({ type: 'setSeed', patch });
  const form = mountSeedForm(body);
  patches.push((state) => form.render({ seed: state.seed, interactive, set }));

  return root;
}
