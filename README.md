# Z1R_Tracker

Item, dungeon and overworld tracker for **The Legend of Zelda** (NES) and **Zelda 1 Randomizer**
playthroughs.

One codebase, three ways to run it:

| Build | What it is | Where it lives |
| --- | --- | --- |
| **Web** | Static site, nothing to install | `apps/web` → GitHub Pages |
| **Desktop** | Downloadable folder that runs offline | `apps/desktop` → release zip |
| **OBS** | Transparent browser source + a clickable dock | `apps/obs` |

All three share `packages/core` (game data, state, logic) and `packages/ui` (rendering), so a fix
lands everywhere at once.

## Quick start

```bash
npm install
```

```bash
npm run dev
```

That serves the web build at the URL Vite prints. `npm run dev:obs` and `npm run dev:desktop` do
the same for the other two targets.

## Using it

- **Left click** an item to add it, **right click** to remove it.
- Progressive items (Sword, Arrow, Boomerang, Candle, Ring, Potion) step up through their tiers and
  wrap back to nothing.
- Rupees, keys and heart totals aren't tracked — the game's own HUD already shows them. Nor are
  boss kills, maps or compasses. What's tracked is items, Triforce pieces, and where things were
  found.
- The overworld map works like a brush: pick a marker in the toolbar above it — Dungeon, Shop, Item
  or *checked, nothing* — then click screens to place it. A Dungeon carries which level it is, a
  Shop what it sells, an Item which spot it is and what's in it. Right click clears a screen.
- Progress saves in the browser automatically. **Export** writes a JSON file; **Import** reads one
  back.

## Seeds, settings and item locations

The **Seed** panel takes the seed number, the full flag string, and the handful of settings that
actually change the tracker's shape. The important one is **Dungeon Quest**: it determines how many
item slots each level has and whether they're **floor** items (lying in a room) or **stair** items
(behind a staircase, in an item basement). Change it and the location list re-shapes to match.

The **Item locations** panel is a slot per findable item — every dungeon floor/stair slot, every
Heart Container, plus the three shuffled overworld spots (White Sword Cave, Armos, Coast). Each row
records *what's there* and *whether you've taken it*, separately, so a hint you can't act on yet
still has somewhere to live.

Turning on **Shuffle minor drops** grows a `+ floor` button per level, since that flag lets a
dungeon hold more floor items than the base tables list.

## Hints

A Z1R hint pairs a subject with an overworld region — "Digdogger gazes… By a Lake" — so the
**Hints** panel is a row per hint: the dungeon (listed by the phrase you actually hear) or item, and
the region. Hit **show** and those screens light up on the overworld grid.

The regions are built into the tiled map rather than left in a reference image: every screen carries
its two-letter region code (`DM`, `LK`, `DE`…), so a hint turns 128 screens into the handful worth
walking to. The **Regions** toggle hides the codes; **Hint map** still opens the original wiki
image. **Mirrored overworld** flips the map and the regions with it.

Full detail — per-quest slot tables, the Mixed Quest split, the region table and where it came
from — is in [`docs/SEEDS.md`](docs/SEEDS.md).

## Accessibility

No state in this tracker is signalled by colour alone. Held items have a solid border and unheld
ones a dashed border; Triforce pieces are hatched when unheld and solid when held; slot kinds are
spelled out as `FLOOR` / `STAIR`; overworld marks are distinct drawn shapes, named on hover and to screen
readers, and the selected brush carries a ring as well as a fill. The rule and the full
table of second channels are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#accessibility) — keep
to it when adding panels.

Contrast is measured rather than eyeballed:

```bash
npm run theme:check
```

That resolves every `--z1r-*` alias through Spectrum's token files and fails if any
foreground/background pair the tracker renders drops below WCAG AA (4.5:1). All nine pairs pass.

## Theming

Colours are not chosen here. `packages/ui/src/theme.css` imports Adobe Spectrum's token package
(`@spectrum-css/tokens`, dark theme and the medium/desktop scale only) and binds each `--z1r-*`
semantic alias to a Spectrum token. The only literal colour left in `styles.css` is `#000`, used for
text outlines on the OBS overlay, where the backdrop is arbitrary gameplay and nothing else would
hold up. The reasoning, including where the accent came from, is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#theming).

## Sprites

**No sprite art is stored in this repo.** `packages/core/src/sprites/manifest.json` maps a stable
logical key (`item.sword.wood`) to a remote URL, and every renderer asks the resolver instead of
hard-coding a path.

Sprites simple enough to draw — the Triforce, hearts, bombs, the Magical Key, and every overworld
mark — are **inline SVG** in `sprites/vectors.ts`, so they need no host, work offline, and look right out
of the box. Anything left over renders as a lettered glyph. Supplying a URL overrides either.

The manifest now ships with 22 item URLs pointing at
[videogamesprites.net](https://www.videogamesprites.net/Zelda1/Objects/) — one transparent GIF per
item, at true NES resolution. Coverage is **36 of 45 keys as art**: 23 from URLs (those 22 plus the
hint-map reference image) and 13 drawn vectors. The nine still on letters are `dungeon.1` …
`dungeon.9`, and they can stay that way — see
[`docs/SPRITES.md`](docs/SPRITES.md).

To wire up your own art, put a CSV next to the repo and run:

```bash
npm run sprites:import -- sprites.csv
```

The CSV needs a header row with a `url` column plus either `key` or `name`. See
[`docs/sprites.example.csv`](docs/sprites.example.csv) and [`docs/SPRITES.md`](docs/SPRITES.md).

To see what's still missing, or to check that every URL is alive:

```bash
npm run sprites:check -- --fetch
```

## OBS

```bash
npm run start:obs
```

Builds and serves three pages on <http://127.0.0.1:4178>. Add `/overlay.html` as a **Browser
Source** for the on-stream half, `/dock.html` as a **Custom Browser Dock** for the half you click,
and `/map.html` as a second dock for the overworld — it's split out so it can be sized properly and
left alone rather than scrolled past. Serve them rather than loading `file://` paths — they sync through `localStorage` and a
`BroadcastChannel`, and both are scoped per origin. Full walkthrough in
[`docs/OBS.md`](docs/OBS.md).

The overlay accepts query parameters:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `sections` | `items,dungeons` | Any of `seed`, `items`, `dungeons`, `locations`, `hintlog`, `hints` |
| `size` | `40` | Item cell size in pixels |
| `width` | `420` | Composition width — laid out at this width, then scaled to fit the source |
| `scale` | auto | Pins the scale factor and turns auto-fit off |

Names outside that list are dropped rather than rendered, so a typo can't put an empty panel on
stream. The overworld grid isn't among them: it's pointless as a static graphic over a game capture,
and it has `map.html` to itself for when you want to read it.

## Testing

```bash
npm test
```

Node's built-in test runner over the pure parts — the reducer and save migration. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#testing).

## Building

```bash
npm run build
```

Outputs land in `apps/*/dist`. Individual targets are `build:web`, `build:obs`, `build:desktop`.

The desktop build emits a classic (non-module) bundle on purpose, so double-clicking `index.html`
works over `file://`. Running `start.cmd` / `start.sh` instead serves it on `127.0.0.1`, which adds
offline sprite caching via a service worker.

## Layout

```
packages/core    game data, seed settings, tracker state, logic hints, sprites
packages/ui      framework-free rendering shared by all three targets
apps/web         GitHub Pages build
apps/desktop     downloadable offline build
apps/obs         browser source + custom dock
scripts          sprite manifest and theme contrast tooling
docs             architecture, sprite and OBS notes
```

There are no runtime dependencies — the tracker is plain TypeScript and DOM, and ships no
framework. The dev dependencies are Vite, TypeScript, esbuild (for the test bundle) and
`@spectrum-css/tokens`, whose CSS variables are inlined into the built stylesheet.

## Status

Functional end to end: items, dungeons, seed settings, derived item locations, the hint log and the
region-labelled overworld all work and persist.

Sprites are largely filled in: 36 of the 45 keys render as art, with the nine level numerals left as
glyphs on purpose. `npm run sprites:check` lists the state of the manifest, and
`-- --fetch` checks the URLs are still alive.

The theme is bound to Spectrum tokens and every rendered colour pair clears WCAG AA. The known cost
is stylesheet size — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#theming).

## License

[MIT](LICENSE) © Bryan Halterman

This project is not affiliated with or endorsed by Nintendo. *The Legend of Zelda* is a trademark of
Nintendo. No game assets are distributed with this repository.
