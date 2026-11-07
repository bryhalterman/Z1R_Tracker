import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { DUNGEON_BOSSES_BY_ID, emptyRoom, type RoomNote } from '@z1r/core';
import {
  bossTitle,
  collectedTitle,
  itemSlotTitle,
  nextPair,
  pairTitle,
  pairsShown,
  visitPatch,
  visitState,
  wipePatch,
} from './room-card/room-text.js';
import { ladderState, roomFacts } from './room-grid/room-facts.js';

const room = (patch: Partial<RoomNote> = {}): RoomNote => ({ ...emptyRoom(), ...patch });

test('visit state: nothing pressed with no room, and visited wins over known', () => {
  assert.equal(visitState('', undefined), null);
  assert.equal(visitState('A1', undefined), 'clear');
  assert.equal(visitState('A1', room({ known: true })), 'known');
  assert.equal(visitState('A1', room({ known: true, visited: true })), 'visited');
});

test('visit patch: Clear and an emptied group both clear the two flags', () => {
  assert.deepEqual(visitPatch('known'), { known: true });
  assert.deepEqual(visitPatch('visited'), { visited: true });
  assert.deepEqual(visitPatch('clear'), { known: false, visited: false });
  assert.deepEqual(visitPatch(''), { known: false, visited: false });
});

test('each wipe is a fresh patch', () => {
  const a = wipePatch();
  const b = wipePatch();
  assert.deepEqual(a, b);
  assert.notEqual(a.doors, b.doors);
});

test('item titles: what is placed, and what Collected would do', () => {
  assert.equal(itemSlotTitle('Bow'), 'Bow');
  assert.match(itemSlotTitle(undefined), /^Nothing placed — /);
  assert.equal(collectedTitle(undefined, true), 'Nothing here to collect');
  assert.equal(collectedTitle('Bow', false), 'Mark Bow picked up, which marks it held');
  assert.equal(
    collectedTitle('Bow', true),
    'Mark Bow not picked up. The inventory keeps what collecting gave it.',
  );
});

test('a Level 9 boss says so in its title', () => {
  assert.equal(bossTitle(DUNGEON_BOSSES_BY_ID.get('ganon')!), 'Ganon — Level 9 only');
});

test('transport pairs: the next open pair, how many to offer, and the unpair hint', () => {
  const rooms = { A1: room({ transport: 1 }), A2: room({ transport: 1 }), A3: room({ transport: 2 }) };
  assert.equal(nextPair(rooms), 2);
  assert.equal(nextPair({}), 1);
  assert.equal(pairsShown({}), 4);
  assert.equal(pairsShown({ A1: room({ transport: 5 }) }), 6);
  assert.equal(pairTitle(2, 2), 'Transport pair 2 — click again to unpair');
  assert.equal(pairTitle(1, 2), 'Transport pair 1');
});

test('ladder state reads the held Ladder only for a room that needs it', () => {
  assert.equal(ladderState(undefined, true), '');
  assert.equal(ladderState(room({ ladder: true }), false), 'blocked');
  assert.equal(ladderState(room({ ladder: true }), true), 'clear');
});

test('room facts, in the order the tooltip lists them', () => {
  assert.deepEqual(roomFacts(undefined, true, 'blocked', undefined), ['entrance', 'needs the Ladder']);
  const note = room({
    visited: true,
    item: 'map',
    collected: true,
    boss: 'ganon',
    stairs: 'transport',
    transport: 2,
    doors: { north: 'open', east: 'unknown', south: 'unknown', west: 'unknown' },
  });
  assert.deepEqual(roomFacts(note, false, 'clear', undefined), [
    'needed the Ladder — held, passable now',
    'visited',
    'holds Map, collected',
    'Ganon',
    'Transport stairs (TP)',
    'transport pair 2',
    'North Open (OP)',
  ]);
  assert.deepEqual(roomFacts(room({ known: true }), false, '', undefined), [
    'known from the map, not visited',
  ]);
});
