/** Public surface of the shared tracker core. */

export * from './items.js';
export * from './dungeons.js';
export * from './overworld.js';
export * from './regions.js';
export * from './seed.js';
export * from './rooms.js';
export * from './layouts.js';
export * from './state.js';
export * from './logic.js';
export * from './placements.js';
export * from './persistence.js';
export * from './util.js';
export * from './sprites/loader.js';
export * from './sprites/vectors.js';

import manifest from './sprites/manifest.json';
import { SpriteResolver, type SpriteManifest } from './sprites/loader.js';
import { attachPersistence, load } from './persistence.js';
import { createInitialState, createStore, type Store } from './state.js';

/** The manifest bundled with the build. Override at runtime via `SpriteResolver.fromUrl`. */
export const bundledManifest = manifest as unknown as SpriteManifest;

export function createDefaultResolver(): SpriteResolver {
  return new SpriteResolver(bundledManifest);
}

/**
 * Prefers a manifest served next to the app (so a stream overlay can be
 * re-skinned without a rebuild) and falls back to the bundled one.
 */
export async function loadResolver(url = 'sprites.json'): Promise<SpriteResolver> {
  try {
    const resolver = await SpriteResolver.fromUrl(url, { cache: 'no-cache' });
    // Shape, not just parseability. A hand-edited override missing the
    // `sprites` key used to reach `entry()` and throw on the first lookup —
    // blanking the tracker in the very "re-skin a live overlay" workflow the
    // docs recommend. A bad override should fall back like a 404 does.
    const sprites = resolver.manifest?.sprites;
    if (!sprites || typeof sprites !== 'object' || Array.isArray(sprites)) {
      return createDefaultResolver();
    }
    // Entries too, not just the container. A hand-edited override missing a
    // `name` reached `entry.name.slice(0, 2)` in the resolver and threw out of
    // `mountTracker` — a blank page, in the exact workflow this guard exists
    // for. Omitting `name` is the likeliest slip when editing by hand.
    const wellFormed = Object.values(sprites).every(
      (entry) => !!entry && typeof entry === 'object' && typeof entry.name === 'string',
    );
    if (!wellFormed) return createDefaultResolver();
    return resolver;
  } catch {
    return createDefaultResolver();
  }
}

export interface BootOptions {
  /**
   * Where the served sprite manifest is, resolved by the caller: core has no
   * document to resolve a relative path against. A URL that cannot be fetched
   * falls back to the bundled manifest, as `loadResolver` does.
   */
  readonly spritesUrl: string;
  /** False for a read-only display, which must never write back. See `SyncOptions`. */
  readonly write?: boolean;
}

export interface Booted {
  readonly store: Store;
  readonly resolver: SpriteResolver;
}

/**
 * The start every app entry shares: restore the saved run, keep it saved and in
 * sync with the other windows, and load the sprite manifest.
 *
 * The store is restored before the resolver is awaited, so a run in progress
 * is in place before the first paint whatever the network does.
 */
export async function bootTracker(options: BootOptions): Promise<Booted> {
  const store = createStore(load() ?? createInitialState());
  attachPersistence(store, { write: options.write ?? true });
  const resolver = await loadResolver(options.spritesUrl);
  return { store, resolver };
}
