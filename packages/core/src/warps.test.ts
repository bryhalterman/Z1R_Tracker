import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { warpRoutes } from './logic.js';
import { reduce, createInitialState, type TrackerState } from './state.js';

/** Place warps 1..n, each on its own screen, in the order given. */
function withWarps(screens: readonly string[]): TrackerState {
  let state = createInitialState();
  screens.forEach((screen, index) => {
    state = reduce(state, { type: 'setMark', screen, mark: 'stairway' });
    state = reduce(state, { type: 'placeStairway', screen, number: index + 1 });
  });
  return state;
}

test('the leftmost staircase always goes to the next warp', () => {
  const routes = warpRoutes(createInitialState());
  assert.deepEqual(
    routes.map((route) => route.exits.find((exit) => exit.position === 'left')?.warp),
    [2, 3, 4, 1],
  );
});

test('middle and right are the two after that, wrapping', () => {
  const routes = warpRoutes(createInitialState());
  assert.deepEqual(
    routes.map((route) => route.exits.map((exit) => exit.warp)),
    [
      [2, 3, 4],
      [3, 4, 1],
      [4, 1, 2],
      [1, 2, 3],
    ],
  );
});

test('a warp never lists itself as an exit', () => {
  for (const route of warpRoutes(createInitialState())) {
    assert.equal(route.exits.some((exit) => exit.warp === route.warp), false);
  }
});

test('screens fill in as warps are marked, and stay null before that', () => {
  const routes = warpRoutes(withWarps(['H8', 'C4']));
  assert.equal(routes[0]?.screen, 'H8');
  assert.equal(routes[1]?.screen, 'C4');
  assert.equal(routes[2]?.screen, null);
  // Warp 1's left staircase lands on warp 2, which is marked on C4.
  assert.equal(routes[0]?.exits[0]?.screen, 'C4');
  // Its middle lands on warp 3, which is not marked yet.
  assert.equal(routes[0]?.exits[1]?.screen, null);
});

test('renumbering a warp moves its screen rather than duplicating it', () => {
  let state = withWarps(['H8', 'C4', 'B11', 'F2']);
  state = reduce(state, { type: 'placeStairway', screen: 'A1', number: 2 });
  const routes = warpRoutes(state);
  assert.equal(routes[1]?.screen, 'A1');
  assert.equal(routes[0]?.exits[0]?.screen, 'A1');
});
