/**
 * OBS Browser Source entry point.
 *
 * Read-only by design. OBS browser sources ignore clicks unless you opt in,
 * and even then a stray click during a run would edit the tracker mid-stream.
 * All editing happens in the dock; this window only reflects it.
 */

import {
  attachPersistence,
  createInitialState,
  createStore,
  load,
  loadResolver,
  type TrackerSectionName,
} from './options.js';
import { mountTracker } from '@z1r/ui';
import '@z1r/ui/styles.css';
import './obs.css';

async function main(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#tracker');
  if (!root) throw new Error('Tracker mount point is missing.');

  const params = new URLSearchParams(window.location.search);

  const sections = (params.get('sections') ?? 'summary,items,dungeons')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean) as TrackerSectionName[];

  const scale = Number(params.get('scale') ?? '1');
  const itemSize = Number(params.get('size') ?? '40');
  if (Number.isFinite(scale) && scale > 0) {
    document.body.style.setProperty('--overlay-scale', String(scale));
  }

  const store = createStore(load() ?? createInitialState('z1r'));
  // `write: false` — the overlay must never be the source of truth. If the
  // dock and overlay both wrote, a stale overlay could clobber a live edit.
  attachPersistence(store, { write: false });

  const resolver = await loadResolver(new URL('sprites.json', document.baseURI).href);

  mountTracker(root, {
    store,
    resolver,
    mode: 'overlay',
    interactive: false,
    sections,
    itemSize: Number.isFinite(itemSize) ? itemSize : 40,
  });
}

void main();
