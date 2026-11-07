import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createInitialState } from '@z1r/core';
import { cardSubject, cardTitle, showingName, statusLine } from './overworld/map-status.js';
import type { MapView } from './overworld/MapTools.js';

const view = (patch: Partial<MapView> = {}): MapView => ({
  selected: '',
  armed: '',
  armedLevel: 0,
  armedStairway: 0,
  armedSecret: '',
  ...patch,
});

test('a brush with a choice waits for it, then names it', () => {
  const state = createInitialState();
  assert.deepEqual(statusLine({ state, view: view({ armed: 'dungeon' }) }), {
    text: 'Pick a level',
    waiting: true,
  });
  assert.deepEqual(statusLine({ state, view: view({ armed: 'dungeon', armedLevel: 3 }) }), {
    text: 'Placing Level 3',
    waiting: false,
  });
  assert.deepEqual(statusLine({ state, view: view({ armed: 'stairway' }) }), {
    text: 'Pick a warp',
    waiting: true,
  });
  assert.equal(
    statusLine({ state, view: view({ armed: 'stairway', armedStairway: 2 }) }).text,
    'Placing Warp 2',
  );
  assert.equal(
    statusLine({ state, view: view({ armed: 'rupeeSecret', armedSecret: 'large' }) }).text,
    'Placing Large rupee secret',
  );
});

test('other brushes read by name; a secret with no size reads like them', () => {
  const state = createInitialState();
  assert.equal(statusLine({ state, view: view({ armed: 'rupeeSecret' }) }).text, 'Placing Rupee secret');
  assert.equal(statusLine({ state, view: view({ armed: 'start' }) }).text, 'Placing the start');
  assert.equal(statusLine({ state, view: view({ armed: 'gamble' }) }).text, 'Placing Gambling');
});

test('with nothing armed, the status names the selected screen and its mark', () => {
  const state = createInitialState();
  state.marks['H8'] = 'shop';
  assert.deepEqual(statusLine({ state, view: view({ selected: 'H8' }) }), {
    text: 'H8 selected · Shop',
    waiting: false,
  });
  assert.equal(statusLine({ state, view: view({ selected: 'A1' }) }).text, 'A1 selected');
  assert.equal(statusLine({ state, view: view() }).text, 'Pick a screen, or a marker to place');
});

test('the card shows the armed marker over the selected screen', () => {
  const state = createInitialState();
  state.marks['H8'] = 'shop';
  assert.equal(cardSubject(state, view({ selected: 'H8' })).showing, 'shop');
  assert.equal(cardSubject(state, view({ selected: 'H8', armed: 'item' })).showing, 'item');
  assert.deepEqual(cardSubject(state, view()), { mark: 'none', note: undefined, showing: '' });
});

test('the card is titled by its screen, or by what to do', () => {
  assert.deepEqual(cardTitle(view({ selected: 'H8' }), 'shop'), { title: 'H8', subtitle: 'Shop' });
  assert.deepEqual(cardTitle(view({ armed: 'shop' }), 'none'), { title: 'Pick a screen', subtitle: '' });
  assert.deepEqual(cardTitle(view(), 'none'), { title: 'No screen selected', subtitle: '' });
});

test('only a real mark has a name for "nothing more to record"', () => {
  assert.equal(showingName('gamble'), 'Gambling');
  assert.equal(showingName('none'), '');
  assert.equal(showingName('start'), '');
  assert.equal(showingName(''), '');
});
