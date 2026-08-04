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
- Counters (Hearts, Keys, Rupees) also respond to the **scroll wheel** and clamp instead of wrapping.
- Overworld screens cycle through Dungeon → Shop → Heart → Item → Bombable → Burnable → Pushable →
  Warp → Checked. Right click walks backwards.
- Progress saves in the browser automatically. **Export** writes a JSON file; **Import** reads one
  back.

The **Can I…** row is a live capability readout — it answers "do I hold what this obstacle needs?"
It deliberately does not claim a location is in logic, because the randomizer shuffles item
placement and dungeon entrances and any such claim would be wrong under some settings.

## Sprites

**No sprite art is stored in this repo.** `packages/core/src/sprites/manifest.json` maps a stable
logical key (`item.sword.wood`) to a remote URL, and every renderer asks the resolver instead of
hard-coding a path.

Keys with no URL render as a lettered glyph, so the tracker is fully usable before any art exists —
which is exactly the state it ships in.

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
| `sections` | `summary,items,dungeons` | Which panels to show, comma separated |
| `size` | `40` | Item cell size in pixels |
| `scale` | `1` | Scales the whole overlay |

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
packages/core    game data, tracker state, logic hints, sprite resolution
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

Early. The tracker is functional end to end; the sprite manifest is still unfilled, so everything
renders as glyphs until art URLs are supplied.

## License

[MIT](LICENSE) © Bryan Halterman

This project is not affiliated with or endorsed by Nintendo. *The Legend of Zelda* is a trademark of
Nintendo. No game assets are distributed with this repository.
