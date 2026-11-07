import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { attachPersistence, exportState, importState, load, save, STORAGE_KEY } from './persistence.js';
import { createInitialState, createStore, reduce } from './state.js';
import { cycleMark } from './overworld.js';
import { SpriteResolver, type SpriteManifest } from './sprites/loader.js';
import { createDefaultResolver, loadResolver } from './index.js';

/** A `Storage` held in memory, for code that takes one as a parameter. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  };
}

/**
 * Waits for a BroadcastChannel message to cross, by polling for its effect
 * rather than sleeping a fixed time a slow runner might not meet.
 */
async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the other window');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Lets any message in flight be delivered, for asserting that nothing changed. */
const drain = () => new Promise((resolve) => setTimeout(resolve, 50));

/* ------------------------------------------------------------------- store */

test('the store notifies with the action, and not for an edit that changes nothing', () => {
  const store = createStore();
  const heard: string[] = [];
  const unsubscribe = store.subscribe((_, action) => heard.push(action?.type ?? ''));
  store.dispatch({ type: 'setItem', id: 'bow', value: 1 });
  store.dispatch({ type: 'setItem', id: 'bow', value: 1 });
  assert.deepEqual(heard, ['setItem']);
  unsubscribe();
  store.dispatch({ type: 'setItem', id: 'bow', value: 0 });
  assert.deepEqual(heard, ['setItem'], 'nothing after unsubscribing');
});

test('one failing subscriber does not stop the others', () => {
  const store = createStore();
  const original = console.error;
  console.error = () => {};
  try {
    let reached = false;
    store.subscribe(() => {
      throw new Error('broken subscriber');
    });
    store.subscribe(() => {
      reached = true;
    });
    store.dispatch({ type: 'setItem', id: 'bow', value: 1 });
    assert.equal(reached, true);
  } finally {
    console.error = original;
  }
});

/* ------------------------------------------------------- reducer actions */

test('cycleMark steps through the marks both ways and clears the note at none', () => {
  let state = reduce(createInitialState(), { type: 'cycleMark', screen: 'C2', direction: 1 });
  assert.equal(state.marks['C2'], cycleMark('none', 1));
  state = reduce(state, { type: 'cycleMark', screen: 'C2', direction: -1 });
  assert.equal('C2' in state.marks, false, 'back to unmarked');
  const back = reduce(createInitialState(), { type: 'cycleMark', screen: 'C2', direction: -1 });
  assert.equal(back.marks['C2'], cycleMark('none', -1));
});

test('removeHint drops the hint and a focus no hint points at any more', () => {
  let state = reduce(createInitialState(), { type: 'addHint' });
  const id = state.hints[0]!.id;
  state = reduce(state, { type: 'updateHint', id, patch: { region: 'lake' } });
  state = reduce(state, { type: 'focusRegion', region: 'lake' });
  assert.equal(state.focusRegion, 'lake');
  assert.equal(reduce(state, { type: 'removeHint', id: 'missing' }), state);
  state = reduce(state, { type: 'removeHint', id });
  assert.equal(state.hints.length, 0);
  assert.equal(state.focusRegion, '');
});

test('focusRegion toggles the same region off', () => {
  let state = reduce(createInitialState(), { type: 'focusRegion', region: 'lake' });
  assert.equal(state.focusRegion, 'lake');
  state = reduce(state, { type: 'focusRegion', region: 'lake' });
  assert.equal(state.focusRegion, '');
});

test('replace adopts the peer’s rev; import lifts rev above both sides', () => {
  const mine = { ...createInitialState(), rev: 10 };
  const peer = { ...createInitialState(), rev: 4 };
  assert.equal(reduce(mine, { type: 'replace', state: peer }).rev, 4);
  assert.equal(reduce(mine, { type: 'import', state: peer }).rev, 11);
  assert.equal(reduce(peer, { type: 'import', state: mine }).rev, 11);
});

test('reset clears the run but keeps rev moving forward', () => {
  let state = reduce(createInitialState(), { type: 'setItem', id: 'bow', value: 1 });
  const rev = state.rev;
  state = reduce(state, { type: 'reset' });
  assert.equal(state.items['bow'], 0);
  assert.ok(state.rev > rev, 'a reset is an edit peers must not treat as stale');
});

/* -------------------------------------------------------------- persistence */

test('save and load round-trip through storage', () => {
  const storage = memoryStorage();
  assert.equal(load(storage), null, 'nothing saved yet');
  const state = reduce(createInitialState(), { type: 'setItem', id: 'bow', value: 1 });
  save(state, storage);
  assert.equal(load(storage)?.items['bow'], 1);
  storage.setItem(STORAGE_KEY, '{not json');
  assert.equal(load(storage), null, 'a broken value loads as nothing rather than throwing');
});

test('export and import round-trip, and import names what is wrong', () => {
  const state = reduce(createInitialState(), { type: 'setItem', id: 'raft', value: 1 });
  assert.equal(importState(exportState(state)).items['raft'], 1);
  assert.throws(() => importState('{'), /not valid JSON/);
  assert.throws(() => importState('{"version":1}'), /not a Z1R_Tracker save/);
});

test('two windows sync over the channel, and a read-only one never writes', async () => {
  const dockStorage = memoryStorage();
  const overlayStorage = memoryStorage();
  const dock = createStore();
  const overlay = createStore();
  const stopDock = attachPersistence(dock, { storage: dockStorage });
  const stopOverlay = attachPersistence(overlay, { storage: overlayStorage, write: false });
  try {
    dock.dispatch({ type: 'setItem', id: 'bow', value: 1 });
    await waitFor(() => overlay.getState().items['bow'] === 1);
    assert.equal(overlay.getState().rev, dock.getState().rev, 'both on one counter');
    assert.notEqual(dockStorage.getItem(STORAGE_KEY), null, 'the dock saved');
    assert.equal(overlayStorage.getItem(STORAGE_KEY), null, 'the overlay did not');
  } finally {
    stopDock();
    stopOverlay();
  }
});

test('an update older than what a window holds is ignored', async () => {
  const ahead = createStore({ ...createInitialState(), rev: 50 });
  const behind = createStore();
  const stopAhead = attachPersistence(ahead, { storage: memoryStorage() });
  const stopBehind = attachPersistence(behind, { storage: memoryStorage() });
  try {
    behind.dispatch({ type: 'setItem', id: 'bow', value: 1 });
    // Proving a negative: give the message time to arrive, then check it was ignored.
    await drain();
    assert.equal(ahead.getState().items['bow'], 0);
    assert.equal(ahead.getState().rev, 50);
  } finally {
    stopAhead();
    stopBehind();
  }
});

/* ----------------------------------------------------------------- sprites */

const manifest: SpriteManifest = {
  version: 1,
  baseUrl: 'https://example.test/art/',
  sprites: {
    'item.bow': { name: 'Bow', url: 'bow.png' },
    'item.sheet': { name: 'Sheet', sheet: '/sheet.png', rect: [1, 2, 3, 4] },
    'item.lettered': { name: 'Lettered', glyph: 'Lt' },
  },
};

test('the resolver prefers art, then a drawn vector, then letters', () => {
  const resolver = new SpriteResolver(manifest);
  assert.deepEqual(resolver.resolve('item.bow'), {
    kind: 'image',
    url: 'https://example.test/art/bow.png',
    name: 'Bow',
  });
  const sheet = resolver.resolve('item.sheet');
  assert.equal(sheet.kind, 'sheet');
  assert.equal(sheet.kind === 'sheet' && sheet.url, 'https://example.test/art/sheet.png');
  assert.deepEqual(resolver.resolve('item.lettered'), { kind: 'glyph', text: 'Lt', name: 'Lettered' });
  assert.deepEqual(resolver.resolve('item.nope'), { kind: 'glyph', text: '?', name: 'item.nope' });
  assert.deepEqual(resolver.missing(), ['item.nope']);
  assert.deepEqual(resolver.unfilled(), ['item.lettered']);
});

test('a key with art falls back to letters, not to the art that just failed', () => {
  const resolver = new SpriteResolver(manifest);
  assert.deepEqual(resolver.fallback('item.bow'), { kind: 'glyph', text: 'Bo', name: 'Bow' });
});

test('loadResolver uses a served manifest, and falls back to the bundled one', async () => {
  const realFetch = globalThis.fetch;
  const serve = (body: unknown, ok = true) =>
    (async () => ({ ok, status: ok ? 200 : 404, json: async () => body })) as unknown as typeof fetch;
  try {
    globalThis.fetch = serve(manifest);
    assert.equal((await loadResolver('sprites.json')).entry('item.bow')?.name, 'Bow');

    const bundled = createDefaultResolver().manifest;
    globalThis.fetch = serve(null, false);
    assert.equal((await loadResolver('sprites.json')).manifest, bundled, 'a 404');
    globalThis.fetch = serve({ version: 1 });
    assert.equal((await loadResolver('sprites.json')).manifest, bundled, 'no sprites table');
    globalThis.fetch = serve({ version: 1, sprites: { 'item.bow': { url: 'x.png' } } });
    assert.equal((await loadResolver('sprites.json')).manifest, bundled, 'an entry with no name');
  } finally {
    globalThis.fetch = realFetch;
  }
});

