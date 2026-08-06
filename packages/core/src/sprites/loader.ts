/**
 * Sprite resolution.
 *
 * Nothing in this repo stores sprite art. The manifest maps a stable logical
 * key ("item.sword.wood") to a remote URL, and every renderer asks the
 * resolver rather than hard-coding a path. Three consequences worth keeping:
 *
 *  1. A key with no URL resolves to a glyph, so the tracker is fully usable
 *     before any art exists.
 *  2. Swapping art packs is a manifest swap, not a code change.
 *  3. A dead remote host degrades to glyphs instead of blank cells.
 */

export interface SpriteEntry {
  /** Absolute URL, or a path appended to the manifest `baseUrl`. Empty = none. */
  readonly url?: string;
  readonly name: string;
  /** 1-3 characters drawn when no URL resolves. */
  readonly glyph?: string;
  /** Optional sprite-sheet source; when set, `rect` selects the region. */
  readonly sheet?: string;
  /** [x, y, width, height] in sheet pixels. */
  readonly rect?: readonly [number, number, number, number];
}

import { VECTORS, type VectorSprite } from './vectors.js';

export interface SpriteManifest {
  readonly version: number;
  readonly baseUrl?: string;
  readonly note?: string;
  readonly sprites: Readonly<Record<string, SpriteEntry>>;
}

export type ResolvedSprite =
  | { kind: 'image'; url: string; name: string }
  | { kind: 'sheet'; url: string; rect: readonly [number, number, number, number]; name: string }
  | { kind: 'svg'; vector: VectorSprite; name: string }
  | { kind: 'glyph'; text: string; name: string };

function join(baseUrl: string | undefined, url: string): string {
  if (!baseUrl) return url;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  return `${baseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

export class SpriteResolver {
  readonly #manifest: SpriteManifest;
  readonly #preloads = new Map<string, Promise<boolean>>();
  /** Natural pixel size per URL, learned during preload. */
  readonly #dimensions = new Map<string, { width: number; height: number }>();
  /** Keys asked for that the manifest doesn't define — surfaced by `missing()`. */
  readonly #unknown = new Set<string>();

  constructor(manifest: SpriteManifest) {
    this.#manifest = manifest;
  }

  static async fromUrl(url: string, init?: RequestInit): Promise<SpriteResolver> {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`Sprite manifest ${url} returned ${response.status}`);
    return new SpriteResolver((await response.json()) as SpriteManifest);
  }

  get manifest(): SpriteManifest {
    return this.#manifest;
  }

  entry(key: string): SpriteEntry | undefined {
    return this.#manifest.sprites[key];
  }

  /**
   * Resolution order: supplied art first, then a drawn vector, then letters.
   * Putting `url`/`sheet` ahead of the vector is what lets a CSV of real NES
   * art override the built-ins without editing code.
   */
  resolve(key: string): ResolvedSprite {
    const entry = this.entry(key);
    if (!entry) {
      // An unknown key can still have a drawn vector — `slot.floor` and
      // friends are rendered without needing a manifest row.
      const vector = VECTORS[key];
      if (vector) return { kind: 'svg', vector, name: key };
      this.#unknown.add(key);
      return { kind: 'glyph', text: '?', name: key };
    }
    if (entry.sheet && entry.rect) {
      return {
        kind: 'sheet',
        url: join(this.#manifest.baseUrl, entry.sheet),
        rect: entry.rect,
        name: entry.name,
      };
    }
    if (entry.url) {
      return { kind: 'image', url: join(this.#manifest.baseUrl, entry.url), name: entry.name };
    }
    const vector = VECTORS[key];
    if (vector) return { kind: 'svg', vector, name: entry.name };
    return { kind: 'glyph', text: entry.glyph ?? String(entry.name ?? key).slice(0, 2), name: entry.name ?? key };
  }

  /**
   * Warms the browser cache. Resolves to false for images that fail to load —
   * callers should treat that as "render the glyph", not as an error.
   */
  preload(key: string): Promise<boolean> {
    const resolved = this.resolve(key);
    if (resolved.kind === 'glyph' || resolved.kind === 'svg') return Promise.resolve(true);

    const cached = this.#preloads.get(resolved.url);
    if (cached) return cached;

    const pending = new Promise<boolean>((resolve) => {
      if (typeof Image !== 'function') {
        resolve(true);
        return;
      }
      const image = new Image();
      image.decoding = 'async';
      /*
       * No Referer.
       *
       * Art hosts hotlink-protect. The wiki serving the overworld map answers a
       * refererred request with a 200x73 thumbnail instead of the 1280x468
       * original — status 200, correct content type, nothing to catch except
       * the size. This probe also records `naturalWidth`, so a downgraded
       * response would poison the dimensions every later sprite is scaled by.
       *
       * The documents set `<meta name="referrer" content="no-referrer">` too,
       * since sprites are painted as CSS backgrounds and those cannot carry a
       * per-element policy. This covers the probe wherever that meta is missed.
       */
      image.referrerPolicy = 'no-referrer';
      // Deliberately NOT crossOrigin='anonymous'. This probe only asks "does
      // this URL load?" — nothing here reads pixels, so CORS buys no safety
      // and costs real hosts: spriters-resource.com serves sprite sheets with
      // no Access-Control-Allow-Origin, so an anonymous request fails and the
      // sprite falls back to a glyph even though CSS renders it fine.
      image.onload = () => {
        this.#dimensions.set(resolved.url, {
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        resolve(true);
      };
      image.onerror = () => resolve(false);
      image.src = resolved.url;
    });

    this.#preloads.set(resolved.url, pending);
    return pending;
  }

  preloadAll(keys: Iterable<string>): Promise<boolean[]> {
    return Promise.all([...keys].map((key) => this.preload(key)));
  }

  /**
   * Natural size of a key's art once loaded, or null.
   *
   * Renderers need this to scale pixel art by a whole number. Fractional
   * scaling with `image-rendering: pixelated` duplicates source pixels
   * unevenly, and the pattern shifts on repaint — which reads as neighbouring
   * sprites distorting whenever anything nearby changes.
   */
  naturalSize(key: string): { width: number; height: number } | null {
    const resolved = this.resolve(key);
    if (resolved.kind !== 'image' && resolved.kind !== 'sheet') return null;
    return this.#dimensions.get(resolved.url) ?? null;
  }

  /** Keys requested during this session that the manifest does not define. */
  missing(): string[] {
    return [...this.#unknown].sort();
  }

  /**
   * What to draw when remote art fails to load.
   *
   * Not the same as `resolve` — that prefers the URL, which is exactly what
   * just failed. A key with both a URL and a drawn vector should degrade to
   * the vector rather than all the way down to letters.
   */
  fallback(key: string): ResolvedSprite {
    const entry = this.entry(key);
    const name = String(entry?.name ?? key);
    const vector = VECTORS[key];
    if (vector) return { kind: 'svg', vector, name };
    return { kind: 'glyph', text: entry?.glyph ?? name.slice(0, 2), name };
  }

  /**
   * Manifest keys with neither remote art nor a drawn vector — the ones that
   * still render as letters. Used by `npm run sprites:check`.
   */
  unfilled(): string[] {
    return Object.entries(this.#manifest.sprites)
      .filter(([key, entry]) => !entry.url && !entry.sheet && !VECTORS[key])
      .map(([key]) => key)
      .sort();
  }
}
