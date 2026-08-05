/** Public surface of the shared tracker core. */

export * from './items.js';
export * from './dungeons.js';
export * from './overworld.js';
export * from './regions.js';
export * from './seed.js';
export * from './state.js';
export * from './logic.js';
export * from './persistence.js';
export * from './sprites/loader.js';
export * from './sprites/vectors.js';

import manifest from './sprites/manifest.json';
import { SpriteResolver, type SpriteManifest } from './sprites/loader.js';

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
    return await SpriteResolver.fromUrl(url, { cache: 'no-cache' });
  } catch {
    return createDefaultResolver();
  }
}
