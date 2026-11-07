/**
 * Hint log panel.
 *
 * The page opens the hint log from the toolbar's bottom sheet; this panel is
 * for the windows that ask for the `hintlog` section by name — the OBS map
 * dock, where hints sit beside the map they point at, and the overlay. The
 * section and its title stay plain DOM, so panel collapsing works as it does
 * for every other panel; the rows are React — see `hint-log/`.
 */

import type { Store } from '@z1r/core';
import type { Patch } from './patch.js';
import { mountHintList } from './hint-log/mount.js';

export function buildHintTracker(store: Store, patches: Patch[], interactive: boolean): HTMLElement {
  const root = document.createElement('section');
  root.className = 'z1r-panel z1r-hint-tracker';

  const title = document.createElement('h2');
  title.className = 'z1r-panel-title';
  title.textContent = 'Hints';
  root.append(title);

  const count = document.createElement('span');
  count.className = 'z1r-locations-summary';
  title.append(count);

  const body = document.createElement('div');
  body.className = 'z1r-hint-rows';
  root.append(body);

  const list = mountHintList(body);
  patches.push((state) => {
    count.textContent = state.hints.length ? String(state.hints.length) : '';
    list.render({ state, interactive, dispatch: store.dispatch });
  });

  return root;
}
