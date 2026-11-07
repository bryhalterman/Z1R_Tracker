import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { collectDisposers, onDispose } from './disposers.js';

test('cleanups registered during a build are returned with it', () => {
  const ran: string[] = [];
  const { built, disposers } = collectDisposers(() => {
    onDispose(() => ran.push('root'));
    onDispose(() => ran.push('listener'));
    return 'panel';
  });
  assert.equal(built, 'panel');
  for (const dispose of disposers) dispose();
  assert.deepEqual(ran, ['root', 'listener']);
});

test('outside a build, onDispose registers nothing', () => {
  onDispose(() => assert.fail('a cleanup outside a build must not be kept'));
  const { disposers } = collectDisposers(() => undefined);
  assert.equal(disposers.length, 0);
});

test('a nested build keeps its own list and restores the outer one', () => {
  const outer = collectDisposers(() => {
    onDispose(() => {});
    const inner = collectDisposers(() => onDispose(() => {}));
    assert.equal(inner.disposers.length, 1);
    // Back in the outer build: this one is the outer's again.
    onDispose(() => {});
  });
  assert.equal(outer.disposers.length, 2);
});

test('a build that throws still stops collecting', () => {
  assert.throws(() =>
    collectDisposers(() => {
      onDispose(() => {});
      throw new Error('build failed');
    }),
  );
  onDispose(() => assert.fail('collection must have ended with the failed build'));
  assert.equal(collectDisposers(() => undefined).disposers.length, 0);
});
