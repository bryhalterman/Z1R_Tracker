# Architecture

## The shape

```
                    ┌─────────────────┐
                    │ packages/core   │  game data · state · logic · sprites
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │ packages/ui     │  React panels in a plain-DOM host
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
        ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
        │ apps/web  │  │apps/desktop│  │ apps/obs  │
        └───────────┘  └───────────┘  └───────────┘
```

Dependencies point one way only. `core` renders nothing: its only browser APIs are storage and
`BroadcastChannel` for persistence, and `fetch` and `Image` for loading sprites. `ui` knows nothing
about which app it's inside; apps hold only their own wiring and build config.

Apps import workspace packages as **TypeScript source**, aliased in `vite.shared.mjs`. There is no
package build step and no ordering constraint — `npm run dev` hot-reloads across package
boundaries.

## State

One plain serializable object, one reducer (`packages/core/src/state.ts`). The same value is:

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

`STATE_VERSION` is **13**. `migrate` is what makes changing the model safe: it rebuilds the state
from the current model rather than spreading the saved object over the new one, so a field that no
longer exists — the old `game` field, the hand-added extra floor slots — doesn't survive a load and
get written back into the next export. It also repairs what an older build could leave behind, such
as a level number on a screen no longer marked as that level. Removing a field needs no version
bump; a bump is only for a change an older build must refuse to load.

## Rendering

`mountTracker` builds each panel's shell — the section and its heading — as plain DOM once.
Everything inside a panel is a React component (shadcn/ui on Base UI, with Tailwind scoped to
`.z1r-ui`) rendered into its own root. Each panel registers a `Patch` that takes the new state
and re-renders its root, so every store change reconciles every root with the whole state.

That is the accepted model, not an accident. Reconciling is cheap at this size, and the work it
does is kept down where it would add up:

- The map's 128 cells, the room sheet's cells and the palette's tiles are memoized and receive
  only the values they draw, so an edit that does not touch a cell skips it.
- `deriveItemLocations` is cached per state object. The store replaces the state on every edit and
  never mutates one, so one edit derives the item locations once however many panels ask.

Three things stay plain DOM on purpose. The OBS overlay's item grid, its Item locations columns and
the Triforce panel draw synchronously, because the overlay measures its first paint to fit itself to
the browser source. The dock's item grid and locations columns are the React versions of the first
two.

Every root comes from `createPanelRoot` (`shared/panel-root.tsx`), which does two things. It wraps
the panel in an error boundary, so a render error replaces that one panel with a notice instead of
emptying it — `runPatches` cannot catch it, because `root.render` only schedules the work. And it
registers the root's unmount with the mount being built (`shared/disposers.ts`), so the function
`mountTracker` returns unmounts every root and removes its document listeners.

Only the mounts the three apps ship are supported. The overlay, the one read-only mount, never shows
the map or the rooms, so those two are always interactive; the Triforce panel, which only the
overlay builds, is always display only.

## Accessibility

**No state may be signaled by color alone.** The maintainer is color blind, and a tracker whose
"do I have this" cue is a green-vs-gray tint is unusable to a chunk of its audience besides.

Every stateful element carries a second, non-color channel:

| Element | Color | Also |
| --- | --- | --- |
| Item cell | accent border when held | dashed border + desaturated + dimmed when not |
| Triforce piece (Item locations column head) | full color when held | gray, faded triangle and a lighter numeral when not; the overlay's plain heads use solid vs dashed borders |
| Location slot kind | per-kind tint | a letter code per kind (`F`, `S`, `H`, …) |
| Overworld mark | per-mark tint | a distinct drawn shape per mark |
| Overworld region | faint region tint | a two-letter code (`DM`, `LK`, …) on every screen |
| Focused hint region | accent ring and code | 2px border, bolder code, every other screen dimmed, the button reads **On map** |
| Location collected | raised chip with a solid ring | hollow chip, gray faded sprite; the overlay's plain chips use solid vs dashed borders |
| Level 9 status | green when open | the sentence changes |
| Levels strip, not found | muted numeral | thin weight; found and complete are bold |
| Levels strip, found vs complete | bright vs gold | **color only** — see below |

When adding a panel, pick the second channel first — shape, text, a mark, or a border style — and
treat color as reinforcement. The mark-shape requirement is also why `mark.*` sprites are drawn as
distinct silhouettes rather than as colored squares.

The Levels strip's found versus complete is the one exception, and a deliberate one: the maintainer
chose bright versus gold numerals over a second mark. The hover title and the accessible label both
say the state in words, so it can still be read without the color.

### The one that got through: `<option>`

History now — the selects are Base UI components rendered in the page, and no native `<select>`
remains — but the rules it produced still apply.

Nothing in the stylesheet targeted `<option>` or `<optgroup>`. A native select popup is drawn by the
platform, not by the page, so the list inherited the control's muted placeholder color and landed
it on the operating system's own gray popup background. Gray on gray: the item picker and the hint
region list were effectively unreadable while open.

It survived review because the part you look at was fine. The *closed* control measured 5.9:1 —
comfortably passing — and the popup only exists while the mouse is down. Options and optgroups now
carry explicit opaque colors of their own rather than inheriting; measured 13.5:1 after.

Two rules came out of it. Any element the platform composites against a surface we don't own must
set both `color` and `background-color` explicitly, never inherit them. And contrast gets measured,
not judged by eye — which is what `npm run theme:check` is for.

## Theming

`packages/ui/src/theme.css` is where the tracker's colors are chosen. Each `--z1r-*` semantic alias
is a literal value, declared on `:root` so the page shell, every mount root and every portalled
popup see the same values without opting in. `shadcn.css` binds shadcn's own variables
(`--background`, `--primary` and the rest) to those aliases, so the React panels and the plain-DOM
panels share one palette.

Outside `theme.css`, literal colors are deliberate exceptions: the categorical map colors in
`overworld.ts` and `regions.ts`, black outlines behind text and sprites drawn over busy art (the
overlay's gameplay, map cells, room marks) in `styles.css` and `obs.css`, the warm highlight on
the finished Triforce, and the translucent black scrim (`bg-black/10`) the shadcn sheet and dialogs
draw behind themselves. The OBS setup page imports `theme.css` for its colors rather than copying
them. A new color belongs in `theme.css` as an alias, not inline.

The values came from Adobe Spectrum. The tracker used to import `@spectrum-css/tokens` and bind each
alias to a Spectrum token, because Spectrum's scales carry documented contrast behavior: against its
`gray-100` panel, the 1000 step is where a hue first clears WCAG AA. Once the React panels moved to
shadcn, the package was dropped and the dark-theme values it resolved to were copied in, so nothing
on screen changed. Two of those choices are worth keeping in mind when editing:

- `--z1r-muted` is the step that measures 6.37:1 on the panel. The step below it measured 4.05:1
  and missed AA.
- The accent is Triforce gold, `#da9f00`, at 5.95:1 on the panel.

Nothing re-derives the values from a design system any more, so the check below is the guarantee.
`npm run theme:check` (`scripts/theme-report.mjs`) reads the aliases from `theme.css` and fails if
any foreground/background pair the tracker renders drops below 4.5:1, including the reversed ones
where page-colored text sits on a filled tag. CI runs it on pushes to `main` and on pull requests.
It exists because the one accessibility bug that shipped came from picking a color by eye.

The import used to cost most of the stylesheet: every Spectrum dark and medium token shipped though
about 25 were read. Dropping it took the web build's stylesheet from about 219KB raw / 32KB gzipped
to about 99KB raw / 16KB gzipped.

## Seeds and derived locations

`seed.ts` holds the randomizer settings; `deriveLocations(settings)` turns them into the list of
findable slots. The list is **derived, never stored**.

That's the important call. Storing the slot list would mean reconciling it whenever a setting
changed — a migration problem for something that is a pure function of the settings. Deriving it
means switching Dungeon Quest simply produces a different list. State keys off the slot **id**, so
switching to 2nd Quest and back leaves everything already recorded intact rather than orphaned.

The overlay's plain-DOM locations columns rebuild only when the derived list's *shape* changes (they
compare a signature of the ids) and otherwise patch their chips in place.

Only settings that change that structure get typed fields. The rest of Z1R's flags round-trip
through a free-text box — see [SEEDS.md](SEEDS.md) for where that line falls and why.

## Logic

`packages/core/src/logic.ts` answers "do I currently hold what this obstacle needs?" and nothing
more.

It deliberately is **not** a reachability solver. The randomizer shuffles item placement, dungeon
entrances and more depending on settings, so any claim of the form "location X is in logic" would be
wrong under some seed.

It used to hold a capability table behind a "Can I…" panel. That panel was removed at the
maintainer's request, and the table went with it — a model of every obstacle that nothing renders is
just weight. What remains reads the tracker's own records: the Level 9 gate and Ganon check, the
items a numbered dungeon screen holds, where each warp staircase leads, and `levelProgress` — not
found, found, or complete — for the Levels strip.

`dungeons.ts` used to carry `vanilla*` fields (screen, item, boss). They were never rendered by any
build and never read as logic, so they've been removed rather than left as furniture.

## Sprites

Covered in [SPRITES.md](SPRITES.md). The architectural point: game data references stable logical
keys, and only the manifest knows URLs. Art can be swapped, hosted anywhere, or absent entirely
without touching a line of game data.

## Why the three builds differ

| | web | desktop | obs |
| --- | --- | --- | --- |
| Vite `base` | `/Z1R_Tracker/` | `./` | `./` |
| Output format | ES modules | **IIFE** | ES modules |
| Entry points | 1 | 1 | 4: setup page, overlay, dock, map dock |
| Service worker | no | yes | no |
| Interactive | yes | yes | both docks; the overlay is read-only |
| Panels offered | all | all | overlay: seed, items, Triforce, locations, hints; dock: items, locations; map dock: seed, hints, overworld, levels |

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

**A new panel** — write it as a React component, give it a `mount.tsx` that renders it through
`createPanelRoot`, add a builder to `tracker.ts`, register it in the `builders` map, and add its
name to `TrackerSection`. That's enough for the web and desktop apps. The OBS lists are in
`apps/obs/src/options.ts`: `DOCK_SECTIONS` and `MAP_SECTIONS` are what the two docks mount, and
`OVERLAY_ALLOWED_SECTIONS` is the allow-list `allowedSections()` filters the overlay's `?sections=`
against, so an excluded or misspelled name is dropped instead of rendering an empty panel live. The
overworld and the levels are the deliberate exclusions from the overlay: they only make sense as
something you click.

## Testing

```bash
npm test
```

`scripts/test.mjs` bundles every `packages/**/*.test.ts` with esbuild and hands the result to Node's
built-in test runner. The bundle step exists because the sources import each other with `.js`
specifiers that only a bundler resolves; there's no framework and no config.

Coverage is deliberately narrow: the reducer, `migrate` and the derivations are pure functions over
plain data, and they're where the bugs have actually been. `migrate` in particular earned its tests —
a plain spread merge silently kept item keys and dungeon fields that had been removed from the
model, so they survived every load and got written back into exported saves. Browser testing
couldn't confirm the fix (the page wasn't re-executing), which is what prompted the harness.

Persistence is tested against an in-memory `Storage` and Node's own `BroadcastChannel`, so two
stores in one test sync the way two OBS windows do; the sprite resolver is tested with `fetch`
stubbed.

Pure helpers in `packages/ui` are tested the same way — `collect.ts`, `placed.ts` and
`shared/disposers.ts` work with no DOM — so logic worth a test is moved out of a panel into a module
like those rather than tested through rendering.

Rendering itself isn't covered. The panels are React components re-rendered from a live store; the
cost of testing them well is high and the failure mode is visible the moment you open the page.
