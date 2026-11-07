import { safeStorage } from '@z1r/core';
import { el } from './dom.js';
import { mountPanelToggle } from './panel/mount.js';

/** Which panels are folded away. A view preference, not run data. */
const COLLAPSE_KEY = 'z1r-tracker:collapsed';

/**
 * The folded set this window has saved, or `null` if it has never saved one.
 *
 * The distinction is the whole point of the return type. "Nothing is folded"
 * and "nobody has ever said" look identical as an empty set, and the caller
 * has to tell them apart: the first is a choice to keep everything open and
 * must be honoured, the second is a first visit and gets the app's defaults.
 * A missing key is the only reliable record of "never chosen" — it is written
 * the first time anything is folded or unfolded and never removed after.
 */
function readCollapsed(): Set<string> | null {
  try {
    const raw = safeStorage()?.getItem(COLLAPSE_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    // Blocked storage, or a hand-edited value. Everything open is a fine
    // fallback — this only decides what is folded, never what is tracked.
    return new Set();
  }
}

/**
 * Let every panel fold away by its heading.
 *
 * Wired here by walking the panels rather than built into each one, so the six
 * existing panels and any later one get it without being touched.
 *
 * Kept out of the tracker state deliberately. State is broadcast to the overlay
 * and written into exported saves, and neither should care which panels someone
 * folded up on the other monitor — this is a property of the window you are
 * looking at, so it lives in its own storage key.
 */
export function wireCollapsing(root: HTMLElement, defaults: readonly string[] = []): void {
  /*
   * A saved set beats the defaults, including an empty saved set.
   *
   * Which is what keeps this from overriding the user: the moment anything is
   * folded or unfolded, the full set is written, so a panel that was opened on
   * purpose is recorded as open and the default never gets a second go at it.
   */
  const collapsed = readCollapsed() ?? new Set(defaults);

  const persist = () => {
    try {
      safeStorage()?.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Folding still works for this session; it just will not be remembered.
    }
  };

  for (const panel of root.querySelectorAll<HTMLElement>('.z1r-panel')) {
    const title = panel.querySelector<HTMLElement>('.z1r-panel-title');
    if (!title) continue;

    // The heading's own text, before the counters and buttons appended after
    // it. Stable across renames of the CSS classes, and readable in storage.
    const name = title.childNodes[0]?.nodeValue?.trim();
    if (!name) continue;
    panel.dataset.section = name;

    // The caret is React, see `panel/`; it draws itself from `setState`.
    const toggleHost = el('span', 'z1r-panel-togglehost');
    const toggle = mountPanelToggle(toggleHost);
    const flip = () => {
      const folded = panel.dataset.collapsed !== 'true';
      if (folded) collapsed.add(name);
      else collapsed.delete(name);
      setState(folded);
      persist();
    };
    const setState = (folded: boolean) => {
      panel.dataset.collapsed = String(folded);
      toggle.render({ name, folded, onToggle: flip });
    };

    title.prepend(toggleHost);

    /*
     * The whole heading is a hit target, not just the caret — a caret alone is
     * a fiddly thing to hit mid-run. Clicks that land on a control inside the
     * heading are left alone, though: several headings carry buttons and
     * counters of their own, and folding the panel out from under one would be
     * a nasty surprise.
     */
    title.addEventListener('click', (event) => {
      const control = (event.target as HTMLElement | null)?.closest('button, select, input, label, a');
      // The caret has its own handler, and anything else in the heading is
      // there to be clicked on its own terms.
      if (control) return;
      flip();
    });

    setState(collapsed.has(name));
  }
}
