/**
 * Hint tracker.
 *
 * A Z1R hint pairs a subject with an overworld region — "Digdogger gazes… By a
 * Lake" — so a row is exactly that pair, plus optional bookkeeping. Picking a
 * region focuses it on the overworld grid, which is the whole point: a hint
 * should turn 128 screens into the eight or so worth walking to.
 */

import {
  DUNGEONS,
  REGIONS,
  REGIONS_BY_ID,
  SHUFFLE_POOL,
  screensInRegion,
  type Store,
  type TrackerState,
} from '@z1r/core';

type Patch = (state: TrackerState) => void;

export function buildHintTracker(
  store: Store,
  patches: Patch[],
  interactive: boolean,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'z1r-panel z1r-hint-tracker';

  const title = document.createElement('h2');
  title.className = 'z1r-panel-title';
  title.textContent = 'Hints';
  root.append(title);

  const count = document.createElement('span');
  count.className = 'z1r-locations-summary';
  title.append(count);

  if (interactive) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'z1r-chip-button';
    add.textContent = '+ hint';
    add.addEventListener('click', () => store.dispatch({ type: 'addHint' }));
    title.append(add);
  }

  const body = document.createElement('div');
  body.className = 'z1r-hint-rows';
  root.append(body);

  const empty = document.createElement('p');
  empty.className = 'z1r-hint-empty';
  empty.textContent = interactive
    ? 'No hints yet. Add one as you hear it, then pick a region to light up the map.'
    : 'No hints yet.';
  root.append(empty);

  // Rows are rebuilt only when the set of hint ids changes; field values patch
  // in place so typing in a note isn't interrupted.
  let renderedIds = '';
  const rowPatches: Patch[] = [];

  patches.push((state) => {
    const ids = state.hints.map((hint) => hint.id).join('|');
    if (ids !== renderedIds) {
      renderedIds = ids;
      rowPatches.length = 0;
      body.replaceChildren();
      for (const hint of state.hints) {
        body.append(buildHintRow(store, hint.id, rowPatches, interactive));
      }
    }
    for (const patch of rowPatches) patch(state);
    empty.hidden = state.hints.length > 0;
    count.textContent = state.hints.length ? String(state.hints.length) : '';
  });

  return root;
}

function buildHintRow(
  store: Store,
  id: string,
  patches: Patch[],
  interactive: boolean,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'z1r-hint-row';

  const update = (patch: Record<string, string>) =>
    store.dispatch({ type: 'updateHint', id, patch });

  const subject = document.createElement('select');
  subject.className = 'z1r-input z1r-hint-subject';
  subject.disabled = !interactive;
  subject.append(new Option('— subject —', ''));
  const levels = document.createElement('optgroup');
  levels.label = 'Dungeons';
  for (const dungeon of DUNGEONS) {
    // The in-game phrasing is what you actually hear, so lead with it.
    levels.append(new Option(`${dungeon.hint} (L${dungeon.level})`, `d${dungeon.level}`));
  }
  const items = document.createElement('optgroup');
  items.label = 'Items';
  for (const entry of SHUFFLE_POOL) items.append(new Option(entry.name, entry.id));
  subject.append(levels, items);
  subject.addEventListener('change', () => update({ subject: subject.value }));

  const region = document.createElement('select');
  region.className = 'z1r-input z1r-hint-region';
  region.disabled = !interactive;
  region.append(new Option('— region —', ''));
  for (const def of REGIONS) region.append(new Option(`${def.code} · ${def.name}`, def.id));
  region.addEventListener('change', () => {
    update({ region: region.value });
    // Choosing a region is almost always followed by wanting to see it.
    if (region.value) store.dispatch({ type: 'focusRegion', region: region.value });
  });

  const show = document.createElement('button');
  show.type = 'button';
  show.className = 'z1r-hint-show';
  show.disabled = !interactive;

  const screen = document.createElement('input');
  screen.type = 'text';
  screen.className = 'z1r-input z1r-hint-screen';
  screen.placeholder = 'heard at';
  screen.maxLength = 4;
  screen.spellcheck = false;
  screen.readOnly = !interactive;
  screen.addEventListener('change', () =>
    update({ screen: screen.value.trim().toUpperCase() }),
  );

  const note = document.createElement('input');
  note.type = 'text';
  note.className = 'z1r-input z1r-hint-note';
  note.placeholder = 'note';
  note.spellcheck = false;
  note.readOnly = !interactive;
  note.addEventListener('input', () => update({ note: note.value }));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'z1r-hint-remove';
  remove.textContent = '×';
  remove.title = 'Remove this hint';
  remove.disabled = !interactive;
  remove.addEventListener('click', () => store.dispatch({ type: 'removeHint', id }));

  row.append(subject, region, show, screen, note, remove);

  patches.push((state) => {
    const hint = state.hints.find((h) => h.id === id);
    if (!hint) return;
    if (document.activeElement !== subject) subject.value = hint.subject;
    if (document.activeElement !== region) region.value = hint.region;
    if (document.activeElement !== screen) screen.value = hint.screen;
    if (document.activeElement !== note) note.value = hint.note;

    const focused = !!hint.region && state.focusRegion === hint.region;
    row.dataset.focused = String(focused);
    show.disabled = !interactive || !hint.region;

    const def = hint.region ? REGIONS_BY_ID.get(hint.region) : undefined;
    if (def) {
      const screens = screensInRegion(def.id, state.seed.mirroredOverworld).length;
      // Text, not just a highlight colour — see the accessibility rule.
      show.textContent = focused ? '◉ on map' : '○ show';
      show.title = `${focused ? 'Hide' : 'Show'} ${def.name} on the map (${screens} screens)`;
    } else {
      show.textContent = '○ show';
      show.title = 'Pick a region first';
    }
  });

  show.addEventListener('click', () => {
    const hint = store.getState().hints.find((h) => h.id === id);
    if (hint?.region) store.dispatch({ type: 'focusRegion', region: hint.region });
  });

  return row;
}
