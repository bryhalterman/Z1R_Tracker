# Sprites

## Why there's no art in this repo

Two reasons, one practical and one legal.

Practical: three build targets need the same art, and a streamer will want to swap art packs without
rebuilding anything. Indirection through a manifest gives both for free.

Legal: the sprites are Nintendo's. Redistributing them in a public MIT-licensed repo would be
relicensing work that isn't ours to relicense. Pointing at a URL doesn't.

## How resolution works

`packages/core/src/sprites/manifest.json` maps a **logical key** to an entry:

```json
"item.sword.wood": { "url": "https://example.com/sword.png", "name": "Wooden Sword", "glyph": "SW" }
```

Renderers never see a URL. They call `resolver.resolve('item.sword.wood')` and get one of four
things back, in this precedence order:

| Result | When | Rendered as |
| --- | --- | --- |
| `sheet` | `sheet` + `rect` are set | the sheet, offset to the region |
| `image` | `url` is set | `background-image`, pixelated |
| `svg` | the key has a built-in vector | inline SVG drawn from `vectors.ts` |
| `glyph` | none of the above | the `glyph` letters in a dashed box |

Supplied art deliberately outranks the built-in vectors, so dropping in a CSV of real NES sprites
overrides them without touching code.

### The vector tier

Some sprites are simple enough to draw: a Triforce piece is three triangles, a rupee is a hexagon,
an overworld shop is a hut. Those live in `packages/core/src/sprites/vectors.ts` as inline SVG.

It costs a few hundred bytes each and buys a lot — no third-party host to go down, no CORS or
hotlink question, works offline, no attribution burden, and the tracker looks finished the moment
you clone it. Items with real detail (swords, the bow, the recorder) stay as glyphs, because a
hand-drawn approximation of a recognisable sprite looks worse than honest letters.

Overworld marks are drawn as **distinct silhouettes**, not coloured squares. That is deliberate —
see the accessibility rule in [ARCHITECTURE.md](ARCHITECTURE.md).

An image that fails to load — dead host, hotlink blocking, offline — **downgrades to its glyph** at
runtime rather than leaving an empty cell. That is the single most important property of this layer:
a tracker that quietly loses half its icons mid-run is worse than one showing letters.

## Filling in the manifest

### From a CSV

```bash
npm run sprites:import -- sprites.csv
```

Header row required. Recognised columns, case-insensitive:

| Column | Aliases | Required | Notes |
| --- | --- | --- | --- |
| `url` | `link`, `src`, `href` | yes | Absolute, or relative to `baseUrl` |
| `key` | `id`, `sprite` | one of | The manifest key — unambiguous, prefer this |
| `name` | `label` | one of | Matched against existing entry names, case-insensitive |
| `glyph` | `fallback` | no | 1–3 character fallback |

Rows are **merged**, not replaced. Importing a partial sheet leaves everything else alone, so you
can fill the manifest in over several passes. A key the manifest doesn't know yet is added rather
than dropped.

See [`sprites.example.csv`](sprites.example.csv) for the shape.

### By hand

Edit `manifest.json` directly. Set `baseUrl` if all your art lives under one host and you'd rather
store short paths:

```json
{ "baseUrl": "https://cdn.example.com/z1r", "sprites": { "item.bow": { "url": "bow.png" } } }
```

Absolute URLs and `data:` URIs ignore `baseUrl`.

### From a sprite sheet

One remote file, many keys:

```json
"item.bow": { "name": "Bow", "sheet": "https://example.com/items.png", "rect": [16, 0, 16, 16] }
```

`rect` is `[x, y, width, height]` in sheet pixels.

## Checking coverage

```bash
npm run sprites:check
```

Lists every key still falling back to a glyph. Add `-- --fetch` to HEAD each URL and flag dead
links; that form exits non-zero on a dead link, so it's safe to wire into CI. Unfilled keys never
fail the check — a glyph is a valid state, not a build error.

## Overriding at runtime

Every build ships a copy of the manifest as `sprites.json` beside its own `index.html`, and fetches
that at startup before falling back to the copy compiled into the bundle. Editing the deployed
`sprites.json` re-skins the tracker with no rebuild — useful for trying an art pack on a live
overlay mid-stream.

The file is emitted at build time from `packages/core/src/sprites/manifest.json`, so there is still
only one copy in the repository. Don't commit per-app copies; they'd drift.

The `file://` desktop build skips the fetch, since local pages can't read sibling files, and uses
its bundled copy.

## Choosing a host

Whatever you point at needs to allow hotlinking and send permissive CORS headers — the loader
requests images with `crossOrigin="anonymous"` so a hostile host can't be handed credentials. Hosts
that block hotlinking will silently serve a placeholder or 403, and the tracker will show glyphs.

If you control the art, a GitHub Pages branch or any static CDN is the least fragile option.

## Key naming

Dot-separated, most general first:

```
item.<item>[.<tier>]     item.sword.magical, item.bow
dungeon.<level>          dungeon.1 … dungeon.9
mark.<kind>              mark.shop, mark.bombable
ui.<element>             ui.triforce, ui.compass
```

Keys are referenced from `items.ts`, `dungeons.ts` and `overworld.ts`. Renaming one means updating
both the manifest and the definition that points at it.
