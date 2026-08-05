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
- Overworld screens cycle through Dungeon → Shop → Heart → Item → Bombable → Burnable → Pushable →
  Warp → Checked. Right click walks backwards.
- Progress saves in the browser automatically. **Export** writes a JSON file; **Import** reads one
  back.

The **Can I…** row is a live capability readout — it answers "do I hold what this obstacle needs?"
It deliberately does not claim a location is in logic, because the randomizer shuffles item
placement and dungeon entrances and any such claim would be wrong under some settings.

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
ones a dashed border; capability chips carry a `✓` or `✕`; slot kinds are spelled out as `FLOOR` /
`STAIR`; overworld marks are distinct drawn shapes, not coloured squares. The rule and the full
table of second channels are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#accessibility) — keep
to it when adding panels.

## Sprites

**No sprite art is stored in this repo.** `packages/core/src/sprites/manifest.json` maps a stable
logical key (`item.sword.wood`) to a remote URL, and every renderer asks the resolver instead of
hard-coding a path.

Sprites simple enough to draw — the Triforce, hearts, bombs, the Magical Key, and every overworld
mark — are **inline SVG** in `sprites/vectors.ts`, so they need no host, work offline, and look right out
of the box. Anything left over renders as a lettered glyph. Supplying a URL overrides either.

To wire up real art, put a CSV next to the repo and run:

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

Add `apps/obs/dist/index.html` as a **Browser Source** for the on-stream overlay, and
`dock.html` as a **Custom Browser Dock** for the half you click. Both must load from the same
origin so they can sync. Full walkthrough in [`docs/OBS.md`](docs/OBS.md).

The overlay accepts query parameters:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `sections` | `summary,items,dungeons` | Any of `summary`, `seed`, `items`, `dungeons`, `locations`, `hintlog`, `map`, `hints` |
| `size` | `40` | Item cell size in pixels |
| `scale` | `1` | Scales the whole overlay |

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
scripts          sprite manifest tooling
docs             architecture, sprite and OBS notes
```

There are no runtime dependencies — the tracker is plain TypeScript and DOM. Vite and TypeScript are
the only dev dependencies.

## Status

Functional end to end: items, dungeons, seed settings, derived item locations, the hint log and the
region-labelled overworld all work and persist.

The sprite manifest holds no remote art yet. The Triforce, hearts, bombs and overworld marks are
drawn as vectors; detailed item sprites (swords, bow, recorder, and friends) still render
as lettered glyphs until URLs are supplied. `npm run sprites:check` lists what's outstanding.

## License

[MIT](LICENSE) © Bryan Halterman

This project is not affiliated with or endorsed by Nintendo. *The Legend of Zelda* is a trademark of
Nintendo. No game assets are distributed with this repository.
