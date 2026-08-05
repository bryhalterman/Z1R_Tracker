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

  const itemSize = Number(params.get('size') ?? '40');

  /*
   * Lay out at a fixed width, then scale to fit the source.
   *
   * A browser source's viewport is whatever you drag the source to, so letting
   * the tracker reflow means resizing rearranges it — columns reflow, panels
   * jump between one row and two, and nothing keeps its proportions. A stream
   * graphic should behave like a graphic: fixed composition, scaled to fit.
   *
   * `?width=` sets the composition width; `?scale=` pins the factor manually
   * and turns auto-fit off.
   */
  const baseWidth = Math.max(200, Number(params.get('width') ?? '420') || 420);
  const fixedScale = Number(params.get('scale') ?? '');
  root.style.inlineSize = `${baseWidth}px`;
  // Set here, not in obs.css: the dock shares that stylesheet and must still
  // scroll, and the selector needed to scope it there does not survive
  // minification. See the note beside `body.overlay { overflow: hidden }`.
  document.documentElement.style.overflow = 'hidden';

  /*
   * Measured from `offsetHeight`, which is layout height and therefore
   * unaffected by the transform we are about to set. The earlier version reset
   * the scale to 1 to take a measurement, which inside a ResizeObserver either
   * loops or reads a stale value — and the content ended up overflowing the
   * source instead of fitting it.
   */
  const applyFit = () => {
    if (Number.isFinite(fixedScale) && fixedScale > 0) {
      document.body.style.setProperty('--overlay-scale', String(fixedScale));
      return;
    }
    const height = root.offsetHeight || 1;
    /*
     * The padding is *inside* the scaled box, so it scales with everything
     * else. Subtracting it from the viewport first — as this did — measures
     * against a width the overlay never occupies, and the result overflows by
     * a little at every size. Add it to the content instead.
     */
    const pad = Number.parseFloat(
      getComputedStyle(document.body).getPropertyValue('--overlay-pad') || '8',
    );
    const gutter = 2 * (Number.isFinite(pad) ? pad : 8);
    /*
     * `documentElement.clientWidth`, not `window.innerWidth`.
     *
     * innerWidth is the *visual* viewport: it includes any page zoom and
     * ignores scrollbars, so the two diverge and the fit is computed against
     * space the layout does not actually have.
     */
    const view = document.documentElement;
    const factor = Math.min(
      view.clientWidth / (baseWidth + gutter),
      view.clientHeight / (height + gutter),
    );
    const next = String(Math.max(factor, 0.1));
    // Compare before writing: a ResizeObserver that always writes re-triggers
    // itself, and Chromium drops the surplus notifications with a console error.
    if (document.body.style.getPropertyValue('--overlay-scale') !== next) {
      document.body.style.setProperty('--overlay-scale', next);
    }
  };

  /*
   * Coalesced for repeated events, but never for the first fit.
   *
   * requestAnimationFrame does not run in a hidden tab, and an OBS source that
   * is not currently being rendered counts as hidden — so deferring the initial
   * fit left the overlay unscaled until something happened to wake it.
   */
  let queued = false;
  const fit = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyFit();
    });
  };

  /*
   * Say so when someone clicks.
   *
   * This page is read-only on purpose. A real browser source never receives
   * clicks — OBS discards them unless Interact is enabled — so a click here
   * almost certainly means it has been added as a Custom Browser Dock by
   * mistake, which otherwise presents as a tracker where nothing responds and
   * nothing explains why.
   */
  document.addEventListener('click', () => {
    if (document.querySelector('.z1r-readonly-note')) return;
    const note = document.createElement('p');
    note.className = 'z1r-readonly-note';
    note.textContent =
      'Read-only overlay. Add dock.html as a Custom Browser Dock to make changes.';
    document.body.append(note);
    window.setTimeout(() => note.remove(), 8000);
  });

  const store = createStore(load() ?? createInitialState());
  // `write: false` — the overlay must never be the source of truth. If the
  // dock and overlay both wrote, a stale overlay could clobber a live edit.
  attachPersistence(store, { write: false });

  const resolver = await loadResolver(new URL('sprites.json', document.baseURI).href);

  // Resize is applied directly: it is infrequent, and routing it through
  // requestAnimationFrame means it never lands while the source is hidden.
  window.addEventListener('resize', applyFit);
  // The observer can fire in bursts as sprites load, so that one is coalesced.
  new ResizeObserver(fit).observe(root);

  mountTracker(root, {
    store,
    resolver,
    mode: 'overlay',
    interactive: false,
    sections,
    compact: true,
    itemSize: Number.isFinite(itemSize) ? itemSize : 40,
  });

  // Synchronous, so the overlay is correct on its very first paint.
  applyFit();
  // Fonts and remote sprites can change the height after first layout.
  document.fonts?.ready.then(applyFit).catch(() => {});
  document.addEventListener('visibilitychange', applyFit);
}

void main();
