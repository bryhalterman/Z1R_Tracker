import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { factLine } from './shared/fact-line.js';

test('facts join into one line, in order', () => {
  assert.equal(factLine(['C4', 'Level 3', 'start screen']), 'C4 — Level 3 — start screen');
});

test('a lone part is the whole line, and no parts is an empty one', () => {
  assert.equal(factLine(['C4']), 'C4');
  assert.equal(factLine([]), '');
});
