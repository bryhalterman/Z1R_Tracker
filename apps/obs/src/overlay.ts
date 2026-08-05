/**
 * OBS Browser Source entry point.
 *
 * Read-only by design. OBS browser sources ignore clicks unless you opt in,
 * and even then a stray click during a run would edit the tracker mid-stream.
 * All editing happens in the dock; this window only reflects it.
 */

import {
  OVERLAY_DEFAULT_SECTIONS,
  allowedSections,
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
  if (!root) throw new Error('Tracker mount point is missing.');

  const params = new URLSearchParams(window.location.search);

  // Filtered rather than trusted: the overworld grid isn't offered in the OBS
  // build at all, and a typo shouldn't put an empty panel on stream.
  const sections = allowedSections(
    (params.get('sections') ?? OVERLAY_DEFAULT_SECTIONS).split(',').map((value) => value.trim()),
  );

  const scale = Number(params.get('scale') ?? '1');
  const itemSize = Number(params.get('size') ?? '40');
  if (Number.isFinite(scale) && scale > 0) {
    document.body.style.setProperty('--overlay-scale', String(scale));
  }

  const store = createStore(load() ?? createInitialState());
  // `write: false` — the overlay must never be the source of truth. If the
  // dock and overlay both wrote, a stale overlay could clobber a live edit.
  attachPersistence(store, { write: false });

  const resolver = await loadResolver(new URL('sprites.json', document.baseURI).href);

  /*
   * Say so when someone clicks.
   *
   * This page is read-only on purpose, and it is served at `/` — so pointing a
   * Custom Browser Dock at the root URL instead of dock.html yields a tracker
   * where every control is disabled and dimmed, with nothing on screen to
   * explain why. A real browser source never receives clicks (OBS discards them
   * unless you enable Interact), so a click here almost certainly means the
   * page is being used as a dock by mistake.
   */
  document.addEventListener('click', () => {
    if (document.querySelector('.z1r-readonly-note')) return;
    const note = document.createElement('p');
    note.className = 'z1r-readonly-note';
    note.textContent =
      'This is the read-only overlay. Add dock.html as a Custom Browser Dock to make changes.';
    document.body.append(note);
    window.setTimeout(() => note.remove(), 8000);
  });

  mountTracker(root, {
    store,
    resolver,
    mode: 'overlay',
    interactive: false,
    sections,
    compact: true,
    itemSize: Number.isFinite(itemSize) ? itemSize : 40,
  });
}

void main();
