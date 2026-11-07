import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { tileModel } from './palette/tile-model.js';

const everywhere = { rooms: true, map: true };
const nowhere = { rooms: false, map: false };

test('a bought tier only says whether it is held', () => {
  const model = tileModel({ inventory: 'arrow', stage: 1 }, {}, false, '', everywhere)!;
  assert.equal(model.name, 'Wooden Arrow');
  assert.equal(model.id, 'arrow.1');
  assert.equal(model.target, '');
  assert.equal(model.held, 'unheld');
  assert.equal(model.bought, true);
  assert.equal(
    model.text,
    'Wooden Arrow — not held — bought in a shop, never placed — click to mark it held',
  );
});

test('a placeable item says where it is, where it can go, and how to use it', () => {
  const model = tileModel('whiteSword', { sword: 2 }, false, 'L1 A1', everywhere)!;
  assert.equal(model.inventory?.id, 'sword');
  assert.equal(model.stage, 2);
  assert.equal(model.held, 'held');
  assert.equal(model.target, 'a room or an overworld screen');
  assert.deepEqual(model.facts, ['held', 'placed at L1 A1']);
  assert.deepEqual(model.hints, [
    'right-click to arm, or drag onto a room or an overworld screen',
    'click to mark it not held',
  ]);
});

test('an armed tile says so, and how to put it down', () => {
  const model = tileModel('whiteSword', {}, true, '', everywhere)!;
  assert.deepEqual(model.facts, ['not held', 'armed']);
  assert.equal(model.hints[0], 'right-click to put it down');
});

test('a dungeon pickup has no held state; with nowhere to place it, it says so', () => {
  const model = tileModel('map', {}, false, '', nowhere)!;
  assert.equal(model.inventory, undefined);
  assert.equal(model.held, 'none');
  assert.deepEqual(model.facts, ['nowhere in this window to place it']);
  assert.deepEqual(model.hints, []);
  assert.equal(model.text, 'Map — nowhere in this window to place it');
});

test('an id that names no item has no tile', () => {
  assert.equal(tileModel('nope', {}, false, '', everywhere), null);
});
