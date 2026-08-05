# Architecture

## The shape

```
                    ┌─────────────────┐
                    │ packages/core   │  game data · state · logic · sprites
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │ packages/ui     │  DOM rendering, no framework
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
        ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
        │ apps/web  │  │apps/desktop│  │ apps/obs  │
        └───────────┘  └───────────┘  └───────────┘
```

Dependencies point one way only. `core` knows nothing about the DOM; `ui` knows nothing about which
app it's inside; apps hold only their own wiring and build config.

Apps import workspace packages as **TypeScript source**, aliased in `vite.shared.mjs`. There is no
package build step and no ordering constraint — `npm run dev` hot-reloads across package
boundaries.

## State

One plain serialisable object, one reducer (`packages/core/src/state.ts`). The same value is:

- written to `localStorage`,
- posted over a `BroadcastChannel` to sync the OBS dock with the OBS overlay,
- exported to a JSON file.

So nothing in state may hold a DOM node, a class instance, or a function. `createStore` is a
20-line subscribe/dispatch loop; there's no reason to reach for a state library at this size.

`attachPersistence` is where the three sinks meet. Three details there are load-bearing:

- A remote update sets an `applyingRemote` flag so it isn't re-broadcast. Without it two windows
  ping-pong forever.
- The overlay attaches with `write: false`. If both windows wrote, a stale overlay could clobber a
  live edit from the dock.
- Incoming updates are ordered by **`state.rev`**, a monotonic counter, not by `updatedAt`.

That last one was a real bug before it was a design note. `updatedAt` is `Date.now()`, which has
millisecond resolution, so several edits dispatched in the same tick all carry the same timestamp. A
`newer-than` comparison then treats every edit after the first as stale and drops it — the dock
would show four items picked up and the overlay would show one. A counter cannot tie.

The two reset-shaped actions differ for the same reason. `replace` (an update from a peer) adopts
the sender's `rev` verbatim so both windows converge on one counter. `import` (a save file the user
opened in *this* window) lifts `rev` above both sides, because it should outrank whatever peers are
holding rather than be judged stale against it.

## Rendering

`mountTracker` builds its DOM once and then patches it. Each section pushes a `Patch` closure that
takes the new state and updates just the nodes it owns.

A full re-render would be simpler and is the obvious first instinct. It's the wrong call here: this
view runs inside an OBS browser source next to a game capture, and replacing hundreds of nodes on
every click is exactly the kind of thing that shows up as a dropped frame on stream.

The items panel is the one exception — it rebuilds wholesale, but only when the *game* changes,
since vanilla and randomizer show different item sets.

## Accessibility

**No state may be signalled by colour alone.** The maintainer is colour blind, and a tracker whose
"do I have this" cue is a green-vs-grey tint is unusable to a chunk of its audience besides.

Every stateful element carries a second, non-colour channel:

| Element | Colour | Also |
| --- | --- | --- |
| Capability hint | green when met | `✓` / `✕` prefix, solid vs dashed border |
| Item cell | accent border when held | dashed border + desaturated + dimmed when not |
| Dungeon flag | accent border when on | dashed border + desaturated when off |
| Location slot kind | per-kind tint | the words `FLOOR` / `STAIR` / `HEART` / `OW` |
| Overworld mark | per-mark tint | a distinct drawn shape per mark |
| Overworld region | faint region tint | a two-letter code (`DM`, `LK`, …) on every screen |
| Focused hint region | raised tint | 2px solid ring, brightened code, `◉ on map` on the button |
| Location collected | dimmed row | the checkbox itself |
| Level 9 status | green when open | the sentence changes |

When adding a panel, pick the second channel first — shape, text, a mark, or a border style — and
treat colour as reinforcement. The mark-shape requirement is also why `mark.*` sprites are drawn as
distinct silhouettes rather than as coloured squares.

## Seeds and derived locations

`seed.ts` holds the randomizer settings; `deriveLocations(settings, extraFloorSlots)` turns them
into the list of findable slots. The list is **derived on every render, never stored**.

That's the important call. Storing the slot list would mean reconciling it whenever a setting
changed — a migration problem for something that is a pure function of two inputs. Deriving it means
switching Dungeon Quest simply produces a different list. State keys off the slot **id**, so
switching to 2nd Quest and back leaves everything already recorded intact rather than orphaned.

The locations panel rebuilds only when the derived list's *shape* changes (it compares a signature
of the ids), and otherwise patches rows in place, same as everything else.

Only settings that change that structure get typed fields. The rest of Z1R's flags round-trip
through a free-text box — see [SEEDS.md](SEEDS.md) for where that line falls and why.

## Logic

`packages/core/src/logic.ts` answers "do I currently hold what this obstacle needs?" and nothing
more.

It deliberately is **not** a reachability solver. The randomizer shuffles item placement, dungeon
entrances and more depending on settings, so any claim of the form "location X is in logic" would be
wrong under some seed. Capability checks stay true under every shuffle.

`dungeons.ts` carries `vanilla*` fields (screen, item, boss). Those are hints for the vanilla build
only and are never read as logic.

## Sprites

Covered in [SPRITES.md](SPRITES.md). The architectural point: game data references stable logical
keys, and only the manifest knows URLs. Art can be swapped, hosted anywhere, or absent entirely
without touching a line of game data.

## Why the three builds differ

| | web | desktop | obs |
| --- | --- | --- | --- |
| Vite `base` | `/Z1R_Tracker/` | `./` | `./` |
| Output format | ES modules | **IIFE** | ES modules |
| Entry points | 1 | 1 | 2 |
| Service worker | no | yes | no |
| Interactive | yes | yes | dock only |

The desktop IIFE build is the only genuinely unusual choice. Browsers refuse `type="module"` scripts
over `file://` because they're treated as cross-origin requests, so a module build would open to a
blank window when someone double-clicks `index.html`. A classic bundle loads fine. A small
`transformIndexHtml` plugin strips the `type="module"` and `crossorigin` attributes Vite adds by
default.

## Adding things

**A new item** — add an `ItemDef` to `items.ts`, add its sprite key(s) to `manifest.json`. Nothing
else; every build picks it up.

**A new overworld mark** — add a `MarkDef` to `overworld.ts` and a `mark.*` manifest key. It joins
the click cycle automatically.

**A new panel** — add a builder to `tracker.ts`, register it in the `builders` map, add its name to
`TrackerSection`. It becomes available to the OBS `?sections=` parameter for free.

## Testing

```bash
npm test
```

`scripts/test.mjs` bundles every `packages/**/*.test.ts` with esbuild and hands the result to Node's
built-in test runner. The bundle step exists because the sources import each other with `.js`
specifiers that only a bundler resolves; there's no framework and no config.

Coverage is deliberately narrow: the reducer and `migrate` are pure functions over plain data, and
they're where the bugs have actually been. `migrate` in particular earned its tests — a plain spread
merge silently kept item keys and dungeon fields that had been removed from the model, so they
survived every load and got written back into exported saves. Browser testing couldn't confirm the
fix (the page wasn't re-executing), which is what prompted the harness.

Rendering isn't covered. It's DOM-patching against a live store; the cost of testing it well is high
and the failure mode is visible the moment you open the page.
