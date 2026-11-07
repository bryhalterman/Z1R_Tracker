import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  isDoorState,
  isRoomBoss,
  isRoomItem,
  isRoomStairKind,
  isRoomTransport,
  ROOM_TRANSPORT_MAX,
} from './rooms.js';

test('isDoorState takes a defined door state and nothing else', () => {
  assert.equal(isDoorState('open'), true);
  assert.equal(isDoorState('bombed'), true);
  assert.equal(isDoorState('bomb'), false);
  assert.equal(isDoorState(''), false);
  assert.equal(isDoorState(3), false);
});

test('isRoomStairKind takes a defined staircase kind and nothing else', () => {
  assert.equal(isRoomStairKind('none'), true);
  assert.equal(isRoomStairKind('transport'), true);
  assert.equal(isRoomStairKind('ladder'), false);
  assert.equal(isRoomStairKind(undefined), false);
});

test('isRoomTransport takes a whole pair number from 1 to the max, never 0', () => {
  assert.equal(isRoomTransport(1), true);
  assert.equal(isRoomTransport(ROOM_TRANSPORT_MAX), true);
  assert.equal(isRoomTransport(0), false);
  assert.equal(isRoomTransport(ROOM_TRANSPORT_MAX + 1), false);
  assert.equal(isRoomTransport(2.5), false);
  assert.equal(isRoomTransport(Number.NaN), false);
  assert.equal(isRoomTransport('2'), false);
});

test('isRoomBoss takes no boss, or a boss the level allows', () => {
  assert.equal(isRoomBoss('', 3), true);
  assert.equal(isRoomBoss('ganon', 9), true);
  assert.equal(isRoomBoss('ganon', 3), false);
  assert.equal(isRoomBoss('nobody', 3), false);
  assert.equal(isRoomBoss(7, 3), false);
});

test('isRoomItem takes no item, or an item a room can hold', () => {
  assert.equal(isRoomItem(''), true);
  assert.equal(isRoomItem('bow'), true);
  assert.equal(isRoomItem('compass'), true);
  assert.equal(isRoomItem('nonsense'), false);
  assert.equal(isRoomItem(null), false);
});
