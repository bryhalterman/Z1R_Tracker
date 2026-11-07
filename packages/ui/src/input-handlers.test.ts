import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { onRightClick, onStepKeys, stepFor } from './shared/input-handlers.js';

const KEYS = { ArrowRight: 1, ArrowLeft: -1 } as const;

/** A stand-in event that records whether the browser's default was taken. */
function fakeEvent(key = '') {
  const event = { key, prevented: false, preventDefault: () => (event.prevented = true) };
  return event;
}

test('stepFor reads the listed keys and nothing else', () => {
  assert.equal(stepFor(KEYS, 'ArrowRight'), 1);
  assert.equal(stepFor(KEYS, 'ArrowLeft'), -1);
  assert.equal(stepFor(KEYS, 'ArrowUp'), undefined);
  // Not a key of the object's prototype either.
  assert.equal(stepFor(KEYS, 'toString'), undefined);
});

test('a listed key steps and takes the key from the browser', () => {
  const steps: number[] = [];
  const handler = onStepKeys(KEYS, (direction) => steps.push(direction));
  const left = fakeEvent('ArrowLeft');
  handler(left);
  assert.deepEqual(steps, [-1]);
  assert.equal(left.prevented, true);
});

test('a key not listed is left alone', () => {
  const steps: number[] = [];
  const handler = onStepKeys(KEYS, (direction) => steps.push(direction));
  const down = fakeEvent('ArrowDown');
  handler(down);
  assert.deepEqual(steps, []);
  assert.equal(down.prevented, false);
});

test('a right click runs the action in place of the menu', () => {
  let ran = 0;
  const event = fakeEvent();
  onRightClick(() => ran++)(event);
  assert.equal(ran, 1);
  assert.equal(event.prevented, true);
});
