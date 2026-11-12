import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createInitialState } from '@z1r/core';
import { cardSubject, cardTitle, showingName, statusLine } from './overworld/map-status.js';
import type { MapView } from './overworld/MapTools.js';

const view = (patch: Partial<MapView> = {}): MapView => ({
  selected: '',
  armed: '',
  ...patch,
});

test('every brush reads by its mark’s name; none waits for a number first', () => {
  const state = createInitialState();
  assert.deepEqual(statusLine({ state, view: view({ armed: 'dungeon' }) }), { text: 'Placing Dungeon' });
  assert.equal(statusLine({ state, view: view({ armed: 'stairway' }) }).text, 'Placing Warp');
  assert.equal(statusLine({ state, view: view({ armed: 'rupeeSecret' }) }).text, 'Placing Rupee secret');
  assert.equal(statusLine({ state, view: view({ armed: 'start' }) }).text, 'Placing the start');
  assert.equal(statusLine({ state, view: view({ armed: 'gamble' }) }).text, 'Placing Gambling');
});

test('with nothing armed, the status names the selected screen and its mark', () => {
  const state = createInitialState();
  state.marks['H8'] = 'shop';
  assert.deepEqual(statusLine({ state, view: view({ selected: 'H8' }) }), { text: 'H8 selected · Shop' });
  assert.equal(statusLine({ state, view: view({ selected: 'A1' }) }).text, 'A1 selected');
  assert.equal(statusLine({ state, view: view() }).text, 'Pick a screen, or a marker to place');
});

test('the card shows the selected screen’s own rows, whatever marker is armed', () => {
  const state = createInitialState();
  state.marks['H8'] = 'shop';
  assert.equal(cardSubject(state, view({ selected: 'H8' })).showing, 'shop');
  assert.equal(cardSubject(state, view({ selected: 'H8', armed: 'item' })).showing, 'shop');
  // Armed with nothing selected, there is no screen for rows to edit.
  assert.equal(cardSubject(state, view({ armed: 'dungeon' })).showing, '');
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
