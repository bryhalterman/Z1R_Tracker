import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { byId, clampWhole, truncClamp, truncWhole } from './util.js';

test('clampWhole keeps a whole number inside 0 to max', () => {
  assert.equal(clampWhole(3, 9), 3);
  assert.equal(clampWhole(12, 9), 9);
  assert.equal(clampWhole(-2, 9), 0);
});

test('clampWhole reads anything not whole as 0', () => {
  assert.equal(clampWhole(2.5, 9), 0);
  assert.equal(clampWhole(Number.NaN, 9), 0);
  assert.equal(clampWhole(Number.POSITIVE_INFINITY, 9), 0);
});

test('truncWhole truncates a finite number and holds it to 0 through max', () => {
  assert.equal(truncWhole(2.9, 9), 2);
  assert.equal(truncWhole(12, 9), 9);
  assert.equal(truncWhole(-3.5, 9), 0);
  assert.equal(truncWhole(1e6), 1e6);
  assert.ok(Object.is(truncWhole(-0.5), 0));
});

test('truncWhole reads anything that is not a finite number as 0', () => {
  assert.equal(truncWhole(Number.NaN), 0);
  assert.equal(truncWhole(Number.POSITIVE_INFINITY), 0);
  assert.equal(truncWhole(Number.NEGATIVE_INFINITY, 9), 0);
  assert.equal(truncWhole('7'), 0);
  assert.equal(truncWhole(undefined), 0);
});

test('truncClamp truncates and clamps, with NaN read as 0 first', () => {
  assert.equal(truncClamp(3.7, 1, 9), 3);
  assert.equal(truncClamp(0, 1, 9), 1);
  assert.equal(truncClamp(42, 1, 9), 9);
  assert.equal(truncClamp(Number.NaN, 1, 9), 1);
  assert.equal(truncClamp(Number.POSITIVE_INFINITY, 1, 4), 4);
  assert.equal(truncClamp(Number.NEGATIVE_INFINITY, 1, 4), 1);
});

test('byId keys a list by id', () => {
  const list = [
    { id: 'a', n: 1 },
    { id: 'b', n: 2 },
  ];
  const table = byId(list);
  assert.equal(table.size, 2);
  assert.equal(table.get('b'), list[1]);
  assert.equal(table.get('c'), undefined);
});

test('byId lets a later entry win on a repeated id, as new Map does', () => {
  const table = byId([
    { id: 'a', n: 1 },
    { id: 'a', n: 2 },
  ]);
  assert.equal(table.get('a')?.n, 2);
});
