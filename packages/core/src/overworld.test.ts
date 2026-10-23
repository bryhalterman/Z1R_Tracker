import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { migrate } from './persistence.js';
import { createInitialState, reduce, type TrackerState } from './state.js';
import {
  MARKS,
  MARKS_BY_KIND,
  OVERWORLD_STAIRWAY_COUNT,
  type MarkKind,
} from './overworld.js';
import { VECTORS } from './sprites/vectors.js';
import { bundledManifest } from './index.js';

import { COAST_SPOT_ID } from './overworld.js';

function marked(screen: string, mark: MarkKind): TrackerState {
  return reduce(createInitialState(), { type: 'setMark', screen, mark });
}

test('the mark kinds are the ones the toolbar offers', () => {
  assert.deepEqual(
    [...MARKS_BY_KIND.keys()].sort(),
    ['doorRepair', 'dungeon', 'gamble', 'hintroom', 'item', 'none', 'rupeeSecret', 'shop', 'stairway', 'visited'],
  );
});

test('a dungeon mark records which level', () => {
  let state = marked('H8', 'dungeon');
  state = reduce(state, { type: 'setScreenNote', screen: 'H8', patch: { dungeon: 3 } });
  assert.equal(state.screenNotes['H8']?.dungeon, 3);
});

test('an unidentified dungeon stores nothing rather than a zero', () => {
  // 0 is the empty value, so it must not leave a key behind to be exported.
  let state = marked('H8', 'dungeon');
  state = reduce(state, { type: 'setScreenNote', screen: 'H8', patch: { dungeon: 0 } });
  assert.equal('H8' in state.screenNotes, false);
});

test('dungeon numbers are clamped to real levels', () => {
  for (const [input, expected] of [
    [12, 9],
    [-3, 0],
    [Number.NaN, 0],
  ] as const) {
    const state = reduce(marked('H8', 'dungeon'), {
      type: 'setScreenNote',
      screen: 'H8',
      patch: { dungeon: input },
    });
    assert.equal(state.screenNotes['H8']?.dungeon ?? 0, expected, `dungeon ${String(input)}`);
  }
});

test('shop stock toggles on and off and stays sorted', () => {
  let state = marked('D4', 'shop');
  for (const stock of ['key', 'arrow', 'bomb']) {
    state = reduce(state, { type: 'toggleShopStock', screen: 'D4', stock });
  }
  // Sorted so the icons never reorder as you tick them, and two shops with the
  // same stock serialise identically.
  assert.deepEqual(state.screenNotes['D4']?.shop, ['arrow', 'bomb', 'key']);

  state = reduce(state, { type: 'toggleShopStock', screen: 'D4', stock: 'bomb' });
  assert.deepEqual(state.screenNotes['D4']?.shop, ['arrow', 'key']);
});

test('clearing a mark discards its detail', () => {
  /*
   * Otherwise re-marking the screen later silently restores a dungeon number
   * from a previous guess, which reads as the tracker inventing data.
   */
  let state = marked('H8', 'dungeon');
  state = reduce(state, { type: 'setScreenNote', screen: 'H8', patch: { dungeon: 7 } });
  state = reduce(state, { type: 'setMark', screen: 'H8', mark: 'none' });
  assert.equal('H8' in state.screenNotes, false);

  state = reduce(state, { type: 'setMark', screen: 'H8', mark: 'dungeon' });
  assert.equal(state.screenNotes['H8']?.dungeon ?? 0, 0);
});

test('the coast is identified by its tag, not by a screen id', () => {
  /*
   * It used to be a hardcoded screen, which was a guess about where the ledge
   * sits. Tagging means the ladder hint follows whichever screen was marked.
   */
  let state = marked('B3', 'item');
  state = reduce(state, {
    type: 'setScreenNote',
    screen: 'B3',
    patch: { spot: COAST_SPOT_ID },
  });
  assert.equal(state.screenNotes['B3']?.spot, COAST_SPOT_ID);
});

test('an item screen records its spot and its contents separately', () => {
  // Found the cave long before knowing what is in it — both halves optional.
  let state = marked('C2', 'item');
  state = reduce(state, { type: 'setScreenNote', screen: 'C2', patch: { spot: 'ow.whiteSword' } });
  assert.equal(state.screenNotes['C2']?.spot, 'ow.whiteSword');
  assert.equal(state.screenNotes['C2']?.item, '');

  state = reduce(state, { type: 'setScreenNote', screen: 'C2', patch: { item: 'raft' } });
  assert.equal(state.screenNotes['C2']?.item, 'raft');
});

test('a visited screen needs no detail to stick', () => {
  // "Checked, nothing here" is the whole content of the mark, so it must
  // survive with an empty note rather than being pruned away.
  const state = marked('D6', 'visited');
  assert.equal(state.marks['D6'], 'visited');
});

test('Blue Ring is stockable', () => {
  const state = reduce(marked('E2', 'shop'), {
    type: 'toggleShopStock',
    screen: 'E2',
    stock: 'blueRing',
  });
  assert.deepEqual(state.screenNotes['E2']?.shop, ['blueRing']);
});

/** `migrate` requires evidence a blob is really a save, so include the basics. */
function saveWith(extra: Record<string, unknown>): Record<string, unknown> {
  return { version: 5, rev: 3, items: {}, dungeons: {}, ...extra };
}

test('migrate drops marks whose kind no longer exists', () => {
  const save = saveWith({
    marks: { A1: 'bombable', B2: 'warp', C3: 'dungeon', D4: 'shop', E5: 'heart' },
  });
  const state = migrate(save);
  assert.ok(state);
  assert.deepEqual(state.marks, { C3: 'dungeon', D4: 'shop' });
});

test('migrate rejects malformed screen notes', () => {
  const save = saveWith({
    marks: { A1: 'shop', A2: 'shop', A3: 'dungeon', A4: 'dungeon' },
    screenNotes: {
      // `shop` is mapped over when rendering, so a string here would iterate
      // character by character rather than throwing anywhere useful.
      A1: { dungeon: 0, shop: 'bomb', spot: '', item: '' },
      A2: { dungeon: 0, shop: ['bomb', 'nonsense', 'bomb'], spot: '', item: '' },
      A3: { dungeon: '4', shop: [], spot: '', item: '' },
      A4: { dungeon: 2, shop: [], spot: 'not-a-real-spot', item: 'not-a-pool-entry' },
      A5: null,
    },
  });
  const state = migrate(save);
  assert.ok(state);
  assert.equal('A1' in state.screenNotes, false, 'string shop is dropped entirely');
  assert.deepEqual(state.screenNotes['A2']?.shop, ['bomb'], 'unknown and duplicate ids removed');
  assert.equal(state.screenNotes['A3']?.dungeon, 4, 'numeric string coerced');
  assert.equal(state.screenNotes['A4']?.item, '', 'unknown pool entry cleared');
  assert.equal(state.screenNotes['A4']?.spot, '', 'unknown spot cleared');
  assert.equal('A5' in state.screenNotes, false);
});

test('meat, a heart container and the magical shield are stockable', () => {
  let state = marked('E3', 'shop');
  for (const stock of ['bait', 'heart', 'magicalShield']) {
    state = reduce(state, { type: 'toggleShopStock', screen: 'E3', stock });
  }
  assert.deepEqual(state.screenNotes['E3']?.shop, ['bait', 'heart', 'magicalShield']);
});

test('a shop price is optional and clamps to a whole number of rupees', () => {
  for (const [input, expected] of [
    [100, 100],
    // Rupees are whole; a typed fraction is truncated rather than refused.
    [20.7, 20],
    // Nothing below zero is a price, and nothing unparseable is either — both
    // land on 0, which is the empty value.
    [-40, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ] as const) {
    let state = reduce(marked('E2', 'shop'), {
      type: 'toggleShopStock',
      screen: 'E2',
      stock: 'bomb',
    });
    state = reduce(state, {
      type: 'setShopPrice',
      screen: 'E2',
      stock: 'bomb',
      price: input,
    });
    assert.equal(
      state.screenNotes['E2']?.shopPrices['bomb'] ?? 0,
      expected,
      `price ${String(input)}`,
    );
  }
});

test('a price of 0 removes the key rather than storing a zero', () => {
  // Otherwise every shop you thought about pricing carries `{"bomb":0}` into
  // the save file and out again on export.
  let state = reduce(marked('E2', 'shop'), {
    type: 'toggleShopStock',
    screen: 'E2',
    stock: 'bomb',
  });
  state = reduce(state, { type: 'setShopPrice', screen: 'E2', stock: 'bomb', price: 20 });
  assert.deepEqual(state.screenNotes['E2']?.shopPrices, { bomb: 20 });

  state = reduce(state, { type: 'setShopPrice', screen: 'E2', stock: 'bomb', price: 0 });
  assert.deepEqual(state.screenNotes['E2']?.shopPrices, {});
  assert.deepEqual(state.screenNotes['E2']?.shop, ['bomb'], 'the stock itself stays');
});

test('untoggling a stock item drops its price with it', () => {
  /*
   * Otherwise ticking the same item again later brings back a number nobody
   * saw in this shop, which reads as the tracker inventing data.
   */
  let state = reduce(marked('E2', 'shop'), {
    type: 'toggleShopStock',
    screen: 'E2',
    stock: 'blueRing',
  });
  state = reduce(state, {
    type: 'setShopPrice',
    screen: 'E2',
    stock: 'blueRing',
    price: 250,
  });
  state = reduce(state, { type: 'toggleShopStock', screen: 'E2', stock: 'blueRing' });
  assert.equal('E2' in state.screenNotes, false, 'nothing left, so the note goes');

  state = reduce(state, { type: 'toggleShopStock', screen: 'E2', stock: 'blueRing' });
  assert.deepEqual(state.screenNotes['E2']?.shopPrices, {});
});

test('a save written before prices existed loads with none', () => {
  // Every save up to v9 predates `shopPrices`. The field has to arrive empty
  // rather than undefined: the reducer spreads it and the map indexes into it.
  const save = saveWith({
    version: 9,
    marks: { A1: 'shop' },
    screenNotes: { A1: { dungeon: 0, shop: ['bomb', 'key'], spot: '', item: '' } },
  });
  const state = migrate(save);
  assert.ok(state);
  assert.deepEqual(state.screenNotes['A1']?.shop, ['bomb', 'key']);
  assert.deepEqual(state.screenNotes['A1']?.shopPrices, {});
});

test('migrate rejects prices that are not whole positive numbers', () => {
  const save = saveWith({
    marks: { A1: 'shop', A2: 'shop' },
    screenNotes: {
      A1: {
        shop: ['arrow', 'bomb', 'key', 'potion'],
        // Drawn as a numeral on a 50px cell, so each of these would either
        // print as nonsense or push the price line off the tile.
        shopPrices: { bomb: -20, key: Number.NaN, potion: 'lots', arrow: 12.9 },
        spot: '',
        item: '',
      },
      // A hostile shape must not throw, and a price for something this shop
      // does not stock renders nowhere — so it is not worth keeping.
      A2: { shop: ['bomb'], shopPrices: 'nonsense', spot: '', item: '' },
      A3: { shop: ['bomb'], shopPrices: { blueRing: 250 }, spot: '', item: '' },
    },
  });
  const state = migrate(save);
  assert.ok(state);
  assert.deepEqual(
    state.screenNotes['A1']?.shopPrices,
    { arrow: 12 },
    'negative, NaN and non-numeric dropped; a fraction truncates',
  );
  assert.deepEqual(state.screenNotes['A2']?.shopPrices, {}, 'a non-object is no prices');
  assert.deepEqual(state.screenNotes['A3']?.shopPrices, {}, 'a price for unstocked goods goes');
});

test('a dungeon records what turned you back', () => {
  let state = marked('F2', 'dungeon');
  for (const block of ['ladder', 'key']) {
    state = reduce(state, { type: 'toggleDungeonBlock', screen: 'F2', block });
  }
  // Sorted, so two dungeons blocked the same way serialise identically.
  assert.deepEqual(state.screenNotes['F2']?.blocks, ['key', 'ladder']);

  state = reduce(state, { type: 'toggleDungeonBlock', screen: 'F2', block: 'key' });
  assert.deepEqual(state.screenNotes['F2']?.blocks, ['ladder']);
});

test('blockers alone are enough to keep a note', () => {
  // A dungeon you found but have not identified still needs its blockers kept.
  const state = reduce(marked('F2', 'dungeon'), {
    type: 'toggleDungeonBlock',
    screen: 'F2',
    block: 'bomb',
  });
  assert.equal(state.screenNotes['F2']?.dungeon, 0);
  assert.deepEqual(state.screenNotes['F2']?.blocks, ['bomb']);
});

test('clearMap wipes the map and nothing else', () => {
  /*
   * The distinction that matters: a run ends with most of 128 screens marked
   * and none of it carries to the next seed, but items and Triforce pieces have
   * their own controls. Taking those too would make this a second Reset.
   */
  let state = marked('A1', 'dungeon');
  state = reduce(state, { type: 'setScreenNote', screen: 'A1', patch: { dungeon: 4 } });
  state = reduce(state, { type: 'setMark', screen: 'B2', mark: 'visited' });
  state = reduce(state, { type: 'setItem', id: 'bow', value: 1 });
  state = reduce(state, { type: 'setDungeon', level: 1, patch: { triforce: true } });

  const cleared = reduce(state, { type: 'clearMap' });
  assert.deepEqual(cleared.marks, {});
  assert.deepEqual(cleared.screenNotes, {});
  assert.equal(cleared.items['bow'], 1, 'items untouched');
  assert.equal(cleared.dungeons['1']?.triforce, true, 'Triforce untouched');
  assert.equal(cleared.seed.seed, state.seed.seed, 'seed untouched');
});

test('clearMap on an empty map is a no-op', () => {
  // No `rev` bump, or every peer window takes a pointless sync round.
  const state = createInitialState();
  assert.equal(reduce(state, { type: 'clearMap' }), state);
});

test('migrate drops blockers it does not recognise', () => {
  const save = saveWith({
    marks: { A1: 'dungeon' },
    screenNotes: { A1: { dungeon: 1, shop: [], blocks: ['ladder', 'nonsense'], spot: '', item: '' } },
  });
  const state = migrate(save);
  assert.ok(state);
  assert.deepEqual(state.screenNotes['A1']?.blocks, ['ladder']);
});

test('a gambling or hint room needs no detail to stick', () => {
  // Like `visited`, the mark is the whole content — these must not be pruned
  // away for having an empty note.
  for (const kind of ['gamble', 'hintroom'] as const) {
    const state = marked('G5', kind);
    assert.equal(state.marks['G5'], kind, kind);
  }
});

test('every mark kind has art and a name', () => {
  /*
   * The toolbar is icons only now, so a kind without a sprite renders as a
   * lettered glyph among drawn shapes — which reads as a broken button rather
   * than a marker.
   */
  for (const mark of MARKS) {
    assert.ok(mark.name, `${mark.kind} has a name`);
    if (mark.kind === 'none') continue;
    assert.ok(mark.sprite, `${mark.kind} has a sprite key`);
    assert.ok(VECTORS[mark.sprite!] || bundledManifest.sprites[mark.sprite!], `${mark.kind} resolves`);
  }
});

test('a level exists in exactly one place', () => {
  /*
   * Two screens both claiming Level 3 is worse than none, because you cannot
   * tell which to walk to. Marking it somewhere new means the old spot was
   * wrong, so it moves.
   */
  let state = reduce(createInitialState(), { type: 'placeDungeon', screen: 'A1', level: 3 });
  state = reduce(state, { type: 'placeDungeon', screen: 'H8', level: 3 });

  assert.equal('A1' in state.marks, false, 'old screen cleared');
  assert.equal(state.marks['H8'], 'dungeon');
  assert.equal(state.screenNotes['H8']?.dungeon, 3);
  assert.equal(
    Object.values(state.screenNotes).filter((n) => n.dungeon === 3).length,
    1,
    'exactly one screen holds level 3',
  );
});

test('a dungeon carries its blockers when it moves', () => {
  // Blockers belong to the dungeon, not to the square of grass it was
  // mistakenly pinned on.
  let state = reduce(createInitialState(), { type: 'placeDungeon', screen: 'A1', level: 3 });
  state = reduce(state, { type: 'toggleDungeonBlock', screen: 'A1', block: 'ladder' });
  state = reduce(state, { type: 'placeDungeon', screen: 'H8', level: 3 });

  assert.deepEqual(state.screenNotes['H8']?.blocks, ['ladder']);
  assert.equal('A1' in state.screenNotes, false);
});

test('placeDungeon clamps to a real level', () => {
  for (const [input, expected] of [[0, 1], [12, 9], [-4, 1]] as const) {
    const state = reduce(createInitialState(), {
      type: 'placeDungeon',
      screen: 'A1',
      level: input,
    });
    assert.equal(state.screenNotes['A1']?.dungeon, expected, `level ${input}`);
  }
});

test('a stairway number exists in exactly one place', () => {
  /*
   * There is one stairway 2. Marking a second means the first was wrong, so
   * the number moves rather than sitting on two screens that cannot both be it.
   */
  let state = reduce(createInitialState(), { type: 'placeStairway', screen: 'A1', number: 2 });
  state = reduce(state, { type: 'placeStairway', screen: 'H8', number: 2 });

  assert.equal('A1' in state.marks, false, 'old screen cleared');
  assert.equal('A1' in state.screenNotes, false, 'old note cleared');
  assert.equal(state.marks['H8'], 'stairway');
  assert.equal(state.screenNotes['H8']?.stairway, 2);
  assert.equal(
    Object.values(state.screenNotes).filter((n) => n.stairway === 2).length,
    1,
    'exactly one screen holds stairway 2',
  );
});

test('two stairways with different numbers both stand', () => {
  // Only the number is unique. Four marks on four screens is the whole point.
  let state = reduce(createInitialState(), { type: 'placeStairway', screen: 'A1', number: 1 });
  state = reduce(state, { type: 'placeStairway', screen: 'H8', number: 2 });

  assert.equal(state.marks['A1'], 'stairway');
  assert.equal(state.marks['H8'], 'stairway');
  assert.equal(state.screenNotes['A1']?.stairway, 1);
  assert.equal(state.screenNotes['H8']?.stairway, 2);
});

test('placeStairway clamps to one of the four', () => {
  for (const [input, expected] of [[0, 1], [7, OVERWORLD_STAIRWAY_COUNT], [-4, 1]] as const) {
    const state = reduce(createInitialState(), {
      type: 'placeStairway',
      screen: 'A1',
      number: input,
    });
    assert.equal(state.screenNotes['A1']?.stairway, expected, `stairway ${input}`);
  }
});

test('migrate rejects a malformed stairway number', () => {
  const save = saveWith({
    marks: { A1: 'stairway', A2: 'stairway', A3: 'stairway', A4: 'stairway' },
    screenNotes: {
      A1: { stairway: 'nonsense', shop: [], spot: '', item: '' },
      A2: { stairway: '3', shop: [], spot: '', item: '' },
      A3: { stairway: 9, shop: [], spot: '', item: '' },
      A4: { stairway: -2, shop: [], spot: '', item: '' },
    },
  });
  const state = migrate(save);
  assert.ok(state);
  // Nothing left worth keeping, so the note goes rather than sitting in the
  // save as an invisible entry.
  assert.equal('A1' in state.screenNotes, false, 'unparseable number dropped');
  assert.equal(state.screenNotes['A2']?.stairway, 3, 'numeric string coerced');
  assert.equal(
    state.screenNotes['A3']?.stairway,
    OVERWORLD_STAIRWAY_COUNT,
    'clamped to the top of the range',
  );
  assert.equal('A4' in state.screenNotes, false, 'negative clamps to 0 and drops the note');
});

/* ------------------------------------------------- rupee secrets and start */

test('a rupee secret records its size, and an unknown size reads as unknown', () => {
  let state = marked('C5', 'rupeeSecret');
  state = reduce(state, { type: 'setScreenNote', screen: 'C5', patch: { secret: 'large' } });
  assert.equal(state.screenNotes['C5']?.secret, 'large');
  state = reduce(state, {
    type: 'setScreenNote',
    screen: 'C5',
    patch: { secret: 'huge' as never },
  });
  assert.equal(state.screenNotes['C5'], undefined, 'nothing left worth keeping');
});

test('there is one start screen: placing it again moves it, the same screen lifts it', () => {
  let state = reduce(createInitialState(), { type: 'setStartScreen', screen: 'H8' });
  assert.equal(state.startScreen, 'H8');
  state = reduce(state, { type: 'setStartScreen', screen: 'G3' });
  assert.equal(state.startScreen, 'G3');
  state = reduce(state, { type: 'setStartScreen', screen: 'G3' });
  assert.equal(state.startScreen, '');
  assert.equal(reduce(state, { type: 'setStartScreen', screen: 'Z99' }), state);
});

test('the start screen sits beside a mark rather than replacing it, and Clear takes both', () => {
  let state = marked('H8', 'item');
  state = reduce(state, { type: 'setStartScreen', screen: 'H8' });
  assert.equal(state.marks['H8'], 'item');
  state = reduce(state, { type: 'clearMap' });
  assert.equal(state.startScreen, '');
  assert.deepEqual(state.marks, {});
});

test('each level has one entrance room, cleared with that level only', () => {
  let state = reduce(createInitialState(), { type: 'setLevelStart', level: 3, room: 'H4' });
  state = reduce(state, { type: 'setLevelStart', level: 3, room: 'H5' });
  state = reduce(state, { type: 'setLevelStart', level: 4, room: 'H2' });
  assert.deepEqual(state.levelStarts, { '3': 'H5', '4': 'H2' });
  assert.equal(reduce(state, { type: 'setLevelStart', level: 10, room: 'H1' }), state);
  state = reduce(state, { type: 'clearRooms', level: 3 });
  assert.deepEqual(state.levelStarts, { '4': 'H2' });
});

test('the new fields survive a save, and bad values are dropped on load', () => {
  let state = marked('C5', 'rupeeSecret');
  state = reduce(state, { type: 'setScreenNote', screen: 'C5', patch: { secret: 'small' } });
  state = reduce(state, { type: 'setStartScreen', screen: 'H8' });
  state = reduce(state, { type: 'setLevelStart', level: 2, room: 'H3' });
  const loaded = migrate(JSON.parse(JSON.stringify(state)));
  assert.ok(loaded);
  assert.equal(loaded.screenNotes['C5']?.secret, 'small');
  assert.equal(loaded.startScreen, 'H8');
  assert.deepEqual(loaded.levelStarts, { '2': 'H3' });

  const bad = migrate({
    ...JSON.parse(JSON.stringify(state)),
    startScreen: 'Q1',
    levelStarts: { '2': 'Z9', '12': 'A1', '5': 'B2' },
  });
  assert.ok(bad);
  assert.equal(bad.startScreen, '');
  assert.deepEqual(bad.levelStarts, { '5': 'B2' });
});

test('every mark and the start pennant have drawn art', () => {
  for (const mark of MARKS) if (mark.sprite) assert.ok(VECTORS[mark.sprite], mark.sprite);
  assert.ok(VECTORS['mark.start']);
});
