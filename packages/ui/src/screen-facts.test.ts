import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { MARKS_BY_KIND, POOL_BY_ID, type MarkKind, type RegionDef, type ScreenNote } from '@z1r/core';
import {
  centredSprite,
  insideEntries,
  screenDetail,
  screenFacts,
  screenLabel,
  shopView,
  shortCode,
  type ScreenFactsInput,
} from './overworld/screen-facts.js';

const note = (patch: Partial<ScreenNote> = {}): ScreenNote => ({
  dungeon: 0,
  stairway: 0,
  shop: [],
  shopPrices: {},
  blocks: [],
  spot: '',
  item: '',
  collected: false,
  secret: '',
  ...patch,
});

const cell = (mark: MarkKind, patch: Partial<ScreenFactsInput> = {}): ScreenFactsInput => ({
  mark,
  note: undefined,
  def: MARKS_BY_KIND.get(mark),
  inside: [],
  exits: '',
  isStart: false,
  isCoast: false,
  coastReady: false,
  level9Ready: false,
  ...patch,
});

test('shortCode takes initials of two words, else the first two letters', () => {
  assert.equal(shortCode('White Sword Cave'), 'WS');
  assert.equal(shortCode('Raft'), 'RA');
  assert.equal(shortCode(undefined), '');
});

test('a dungeon lists its level, contents and blockers; the detail is the blocker codes', () => {
  const n = note({ dungeon: 3, blocks: ['key', 'bomb'] });
  const inside = insideEntries('whiteSword,nope');
  assert.deepEqual(
    inside.map((entry) => entry.id),
    ['whiteSword'],
  );
  assert.deepEqual(screenFacts(cell('dungeon', { note: n, inside })), [
    'Level 3',
    'holds White Sword',
    'blocked by Locked door, Bomb wall',
  ]);
  assert.equal(screenDetail('dungeon', n), 'KY BM');
  assert.equal(centredSprite('dungeon', n, MARKS_BY_KIND.get('dungeon'), 0), undefined);
});

test('an unidentified dungeon calls out an open Level 9 and the start screen', () => {
  assert.deepEqual(screenFacts(cell('dungeon', { level9Ready: true, isStart: true })), [
    'Dungeon (unidentified)',
    'every Triforce piece held — Level 9 is open',
    'start screen',
  ]);
});

test('a shop draws three icons, counts the rest, and lists all of them with prices', () => {
  const n = note({ shop: ['bomb', 'key', 'arrow', 'potion'], shopPrices: { key: 100 } });
  assert.deepEqual(shopView('shop', n), {
    stocked: ['bomb', 'key', 'arrow'],
    overflow: 1,
    prices: [0, 100, 0],
    pricesShown: true,
    widest: 3,
  });
  assert.deepEqual(screenFacts(cell('shop', { note: n })), ['Shop: Bombs, Keys 100, Arrows, Potion']);
  assert.equal(centredSprite('shop', n, MARKS_BY_KIND.get('shop'), 3), undefined);
});

test('an empty shop draws the shop mark and says only "Shop"', () => {
  assert.deepEqual(shopView('shop', undefined), {
    stocked: [],
    overflow: 0,
    prices: [],
    pricesShown: false,
    widest: 0,
  });
  assert.deepEqual(screenFacts(cell('shop')), ['Shop']);
  assert.equal(centredSprite('shop', undefined, MARKS_BY_KIND.get('shop'), 0), 'mark.shop');
});

test('a non-shop has no shop columns', () => {
  assert.deepEqual(shopView('item', note({ shop: ['bomb'] })).stocked, []);
});

test('an item screen names its spot and item, and draws the item', () => {
  const n = note({ spot: 'ow.whiteSword', item: 'whiteSword', collected: true });
  assert.deepEqual(screenFacts(cell('item', { note: n })), ['White Sword Cave', 'White Sword', 'collected']);
  assert.equal(screenDetail('item', n), 'WS');
  assert.equal(centredSprite('item', n, MARKS_BY_KIND.get('item'), 0), POOL_BY_ID.get('whiteSword')!.sprite);
});

test('an unknown coast item says what it needs', () => {
  assert.deepEqual(screenFacts(cell('item', { isCoast: true })), [
    'Item',
    'contents unknown',
    'needs the Ladder',
  ]);
  assert.deepEqual(screenFacts(cell('item', { isCoast: true, coastReady: true })), [
    'Item',
    'contents unknown',
    'Ladder held — reachable now',
  ]);
  assert.equal(screenDetail('item', undefined), '?');
});

test('a warp lists its number and where each staircase leads', () => {
  const exits = 'Left → warp 1 (B4)|Middle → warp 3, not marked yet';
  assert.deepEqual(screenFacts(cell('stairway', { note: note({ stairway: 2 }), exits })), [
    'Warp 2',
    'Left → warp 1 (B4)',
    'Middle → warp 3, not marked yet',
  ]);
  assert.deepEqual(screenFacts(cell('stairway')), ['Warp (unnumbered)']);
  assert.equal(centredSprite('stairway', undefined, MARKS_BY_KIND.get('stairway'), 0), undefined);
});

test('a rupee secret gives its size in words and as one letter', () => {
  const n = note({ secret: 'medium' });
  assert.deepEqual(screenFacts(cell('rupeeSecret', { note: n })), ['Medium rupee secret']);
  assert.equal(screenDetail('rupeeSecret', n), 'M');
  assert.deepEqual(screenFacts(cell('rupeeSecret')), ['Rupee secret (size unknown)']);
  assert.equal(screenDetail('rupeeSecret', undefined), '');
});

test('any other mark is its name; an unmarked screen says nothing', () => {
  assert.deepEqual(screenFacts(cell('gamble')), ['Gambling']);
  assert.deepEqual(screenFacts(cell('none')), []);
  assert.equal(screenDetail('gamble', undefined), '');
});

test('the label joins the screen, its region and the facts', () => {
  const region = { name: 'By a Lake' } as unknown as RegionDef;
  assert.equal(screenLabel('H8', region, ['Shop']), 'H8 — By a Lake — Shop');
  assert.equal(screenLabel('H8', undefined, []), 'H8');
});
