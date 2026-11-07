import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { paint, scaleSheet } from './sprite.js';

/** Enough of an element for the painter, which only writes styles and text. */
function fakeElement() {
  const style: Record<string, string> & { removeProperty?: (name: string) => void } = {};
  return { style, dataset: {} as Record<string, string>, textContent: '' } as unknown as HTMLElement;
}

test('a sheet sprite scales its offset and the whole sheet by the same factor', () => {
  const element = fakeElement();
  const rect = [16, 8, 16, 16] as const;
  // A 16px region drawn in a 32px box: 2x.
  paint(element, { kind: 'sheet', url: 'sheet.png', rect, name: 'Bow' }, 32);
  assert.equal(element.style.backgroundPosition, '-32px -16px');
  scaleSheet(element, { width: 256, height: 128 }, rect, 32);
  assert.equal(element.style.backgroundSize, '512px 256px');
});

test('a sheet whose size is unknown keeps its unscaled size', () => {
  const element = fakeElement();
  element.style.backgroundSize = 'auto';
  scaleSheet(element, null, [0, 0, 16, 16], 32);
  assert.equal(element.style.backgroundSize, 'auto');
});
