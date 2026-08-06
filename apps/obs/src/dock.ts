/**
 * OBS Custom Browser Dock entry point.
 *
 * This is the half you click. Edits land in localStorage and are broadcast to
 * the overlay in the same OBS instance, so both windows must be loaded from
 * the *same origin* — see docs/OBS.md.
 */

import {
  DOCK_SECTIONS,
  attachPersistence,
  createInitialState,
  createStore,
  load,
  loadResolver,
} from './options.js';
import { mountControls, mountTracker } from '@z1r/ui';
import '@z1r/ui/styles.css';
import './obs.css';

/**
 * On-screen diagnostics, shown with `?debug=1`.
 *
 * OBS can be told to expose Chrome DevTools with `--remote-debugging-port`, but
 * the DevTools frontend and the Chromium OBS embeds have to agree on protocol
 * version and frequently do not — it connects and immediately reports the
 * socket as disconnected. Since the only thing needed from it is a handful of
 * numbers, the page can just report them itself and be read off the screen.
 *
 * Deliberately not on by default and deliberately dock-only: nothing
 * diagnostic belongs on a stream.
 */
function showDiagnostics(): void {
  const panel = document.createElement('pre');
  panel.className = 'z1r-diagnostics';
  document.body.prepend(panel);

  const chromium = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? 'unknown';

  const sample = () => {
    const cell = document.querySelector<HTMLElement>('.z1r-screen');
    const image = document.querySelector<HTMLImageElement>('.z1r-screen-terrain img');
    const images = [...document.querySelectorAll<HTMLImageElement>('.z1r-screen-terrain img')];
    const loaded = images.filter((img) => img.complete && img.naturalWidth > 0).length;
    const painted = cell?.getBoundingClientRect();

    panel.textContent = [
      `build          ${__BUILD_ID__}`,
      `chromium       ${chromium}`,
      // The one that decides whether the whole surface gets resampled.
      `devicePixelRatio ${globalThis.devicePixelRatio}`,
      `cell layout    ${cell?.offsetWidth ?? '?'} x ${cell?.offsetHeight ?? '?'} css px`,
      `cell painted   ${painted ? painted.width.toFixed(2) : '?'} x ${painted ? painted.height.toFixed(2) : '?'}`,
      // A painted size that differs from the layout size means something above
      // this page is scaling it, which no CSS here can compensate for.
      `surface scale  ${painted && cell?.offsetWidth ? (painted.width / cell.offsetWidth).toFixed(4) : '?'}`,
      `map source     ${image ? `${image.naturalWidth} x ${image.naturalHeight}` : 'not loaded'}`,
      `image-rendering ${image ? getComputedStyle(image).imageRendering : '?'}`,
      `screens loaded ${loaded} / ${images.length}`,
    ].join('\n');
  };

  sample();
  // Sprites and the map arrive over the network, so take it again once they
  // have settled rather than reporting a half-loaded page.
  window.setTimeout(sample, 1500);
  panel.addEventListener('click', sample);
}

async function main(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#tracker');
  const controls = document.querySelector<HTMLElement>('#controls');
  if (!root || !controls) throw new Error('Dock mount points are missing.');

  const store = createStore(load() ?? createInitialState());
  attachPersistence(store);

  const resolver = await loadResolver(new URL('sprites.json', document.baseURI).href);

  /*
   * Stamp the build into the footnote.
   *
   * A Custom Browser Dock has no "Refresh cache of current page" — that button
   * exists only on Browser Sources — so a dock can go on serving a cached copy
   * across OBS restarts with nothing on screen to say so. Chasing a rendering
   * bug that had already been fixed is exactly what that costs, so the dock now
   * says which build it is running.
   */
  mountControls(controls, {
    store,
    footnote: `Browser source: overlay.html · build ${__BUILD_ID__}`,
  });
  mountTracker(root, { store, resolver, itemSize: 34, sections: DOCK_SECTIONS, compact: true });

  if (new URLSearchParams(window.location.search).get('debug') === '1') showDiagnostics();
}

void main();
