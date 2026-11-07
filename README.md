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

Needs Node 22 or later.

```bash
npm install
```

```bash
npm run dev
```

That serves the web build at the URL Vite prints. `npm run dev:obs` and `npm run dev:desktop` do
the same for the other two targets.

## Using it

The [user guide](docs/GUIDE.md) walks through every panel and control. For a player's-eye tour of
what the tracker does, read the [Z1R Tracker article](https://www.xunlyn.com/codex/z1r/z1r-tracker)
on Xunlyn85.

- In the item palette, **drag** an item onto a room or a map screen to record where it was found,
  or **right click** it to arm it and then click there. **Click** an item to mark it held.
- In the OBS dock's item grid, **click** raises an item and **right click** or **Shift+click** lowers
  it. Progressive items (Sword, Arrow, Boomerang, Candle, Ring, Potion) step through their tiers and
  wrap back to nothing.
- Rupees, keys and heart totals aren't tracked — the game's own HUD already shows them. Nor are
  boss kills, maps or compasses. What's tracked is items, Triforce pieces, and where things were
  found.
- The overworld map works like a brush: pick a marker in the bar above it — Dungeon, Shop, Item,
  Warp, *checked, nothing* and the rest — then click screens to place it. A Dungeon carries which level it is, a
  Shop what it sells, an Item which spot it is and what's in it. Right click clears a screen.
- Progress saves in the browser automatically. **Export** writes a JSON file; **Import** reads one
  back.

## Seeds, settings and item locations

The **Seed** settings, opened from the header, take the seed number, the full flag string, and the handful of settings that
actually change the tracker's shape. The important one is **Dungeon Quest**: it determines how many
item slots each level has and whether they're **floor** items (lying in a room) or **stair** items
(behind a staircase, in an item basement). Change it and the location list re-shapes to match.

The **Item locations** panel is a slot per findable item — every dungeon floor/stair slot, every
Heart Container, plus the three shuffled overworld spots (White Sword Cave, Armos, Coast). Each row
records *what's there* and *whether you've taken it*, separately, so a hint you can't act on yet
still has somewhere to live.

**Shuffle minor drops** lets a dungeon hold more floor items than the base tables list. A floor item
found after a level's floor spots are full is still listed, as an extra chip beside that level's
slots, so there is nothing to add by hand.

## Hints

A Z1R hint pairs a subject with an overworld region — "Digdogger gazes… By a Lake" — so the
**Hints** log, opened from the header, is a row per hint: the dungeon (listed by the phrase you actually hear) or item, and
the region. Hit **show** and those screens light up on the overworld grid.

The regions are built into the tiled map rather than left in a reference image: every screen carries
its two-letter region code (`DM`, `LK`, `DE`…), so a hint turns 128 screens into the handful worth
walking to. The **Regions** toggle hides the codes; **Hint map** still opens the original wiki
image. **Mirrored overworld** flips the map and the regions with it.

Full detail — per-quest slot tables, the Mixed Quest split, the region table and where it came
from — is in [`docs/SEEDS.md`](docs/SEEDS.md).

## Accessibility

No state in this tracker is signaled by color alone. Held items have a solid border and unheld
ones a dashed border; Triforce pieces are hatched or dashed when unheld and solid when held; slot
kinds carry a letter code; overworld marks are distinct drawn shapes, named on hover and to screen
readers, and the selected brush carries a ring as well as a fill. The one deliberate exception, the
Levels strip's found versus complete, says its state in words on hover and to screen readers. The rule and the full
table of second channels are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#accessibility) — keep
to it when adding panels.

Contrast is measured rather than eyeballed:

```bash
npm run theme:check
```

That reads every `--z1r-*` alias from `packages/ui/src/theme.css` and fails if any
foreground/background pair the tracker renders drops below WCAG AA (4.5:1). CI runs it on pushes to
`main` and on pull requests.

## Theming

Colors are chosen in one place: `packages/ui/src/theme.css` binds each `--z1r-*` semantic alias to
a literal value, and the React components read the same aliases through `shadcn.css`. The values
came from Adobe Spectrum's dark theme, which the tracker imported until the React panels moved to
shadcn. The exceptions, and where the accent came from, are in
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
and `/map.html` as a second dock for the overworld and the levels — it's split out so the maps can
be sized properly and left alone rather than scrolled past. Serve them rather than loading `file://` paths — they sync through `localStorage` and a
`BroadcastChannel`, and both are scoped per origin. Full walkthrough in
[`docs/OBS.md`](docs/OBS.md).

The overlay accepts query parameters:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `sections` | `items,dungeons` | Any of `seed`, `items`, `dungeons`, `locations`, `hintlog` |
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

CI also runs `npm run typecheck` (the apps, core on its own without Node types, and the build
scripts), `npm run lint` (ESLint, including React's rules of hooks), `npm run format:check`
(Prettier; `npm run format` fixes it) and `npm run theme:check`.

Node's built-in test runner over the pure parts — the reducer, save migration, derived item
locations, saving and syncing between windows, the sprite resolver, and the UI's pure helpers. See
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
packages/ui      React panels in a plain-DOM host, shared by all three targets
apps/web         GitHub Pages build
apps/desktop     downloadable offline build
apps/obs         browser source + custom dock
scripts          sprite manifest and theme contrast tooling
docs             architecture, sprite and OBS notes
```

The panels are React components built on shadcn/ui and Base UI, with Tailwind scoped to them; the
runtime dependencies are listed in `packages/ui/package.json`. The dev dependencies are Vite,
TypeScript, Tailwind and esbuild (for the test bundle).

## Status

Functional end to end: items, dungeons, seed settings, derived item locations, the hint log and the
region-labeled overworld all work and persist.

Sprites are largely filled in: 36 of the 45 keys render as art, with the nine level numerals left as
glyphs on purpose. `npm run sprites:check` lists the state of the manifest, and
`-- --fetch` checks the URLs are still alive.

Every rendered color pair clears WCAG AA, measured by `npm run theme:check` — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#theming).

## License

[MIT](LICENSE) © Bryan Halterman

This project is not affiliated with or endorsed by Nintendo. *The Legend of Zelda* is a trademark of
Nintendo. No game assets are distributed with this repository.
