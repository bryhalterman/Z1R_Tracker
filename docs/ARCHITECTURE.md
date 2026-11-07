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

`STATE_VERSION` is **3**. Version 3 dropped the `game` field, along with the Randomizer/Vanilla
toggle that was its only reader. `migrate` is what makes a removal like that safe: it rebuilds the
state from the current model rather than spreading the saved object over the new one, so a field
that no longer exists doesn't survive a load and get written back into the next export.

## Rendering

`mountTracker` builds its DOM once and then patches it. Each section pushes a `Patch` closure that
takes the new state and updates just the nodes it owns.

A full re-render would be simpler and is the obvious first instinct. It's the wrong call here: this
view runs inside an OBS browser source next to a game capture, and replacing hundreds of nodes on
every click is exactly the kind of thing that shows up as a dropped frame on stream.

The locations panel is the one exception, and only when the derived slot list changes *shape* — see
below. Everything else, items included, is patched in place.

The items panel used to rebuild wholesale whenever the Randomizer/Vanilla toggle flipped. Both the
toggle and the game concept behind it are gone: every item in `items.ts` carried both games, so the
filter filtered nothing and the switch cost a full rebuild to produce an identical grid. The
summary bar (Triforce count, found count, "8 to go") went at the same time — it restated what the
grid above it already showed.

## Accessibility

**No state may be signalled by colour alone.** The maintainer is colour blind, and a tracker whose
"do I have this" cue is a green-vs-grey tint is unusable to a chunk of its audience besides.

Every stateful element carries a second, non-colour channel:

| Element | Colour | Also |
| --- | --- | --- |
| Item cell | accent border when held | dashed border + desaturated + dimmed when not |
| Dungeon flag | accent border when on | dashed border + desaturated when off |
| Location slot kind | per-kind tint | the words `FLOOR` / `STAIR` / `HEART` / `OW` |
| Overworld mark | per-mark tint | a distinct drawn shape per mark |
| Overworld region | faint region tint | a two-letter code (`DM`, `LK`, …) on every screen |
| Focused hint region | raised tint | 2px solid ring, brightened code, `◉ on map` on the button |
| Location collected | dimmed row | the checkbox itself |
| Level 9 status | green when open | the sentence changes |
| Select option / optgroup | explicit opaque pair, never inherited | the option's own text; see below |

When adding a panel, pick the second channel first — shape, text, a mark, or a border style — and
treat colour as reinforcement. The mark-shape requirement is also why `mark.*` sprites are drawn as
distinct silhouettes rather than as coloured squares.

### The one that got through: `<option>`

Nothing in the stylesheet targeted `<option>` or `<optgroup>`. A native select popup is drawn by the
platform, not by the page, so the list inherited the control's muted placeholder colour and landed
it on the operating system's own grey popup background. Grey on grey: the item picker and the hint
region list were effectively unreadable while open.

It survived review because the part you look at was fine. The *closed* control measured 5.9:1 —
comfortably passing — and the popup only exists while the mouse is down. Options and optgroups now
carry explicit opaque colours of their own rather than inheriting; measured 13.5:1 after.

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
where page-colored text sits on a filled tag. CI runs it on pushes to `main` and on pull requests. It exists because the one
accessibility bug that shipped came from picking a color by eye.

The import used to cost most of the stylesheet: every Spectrum dark and medium token shipped though
about 25 were read. Dropping it took the web build's stylesheet from about 219KB raw / 32KB gzipped
to about 99KB raw / 16KB gzipped.

## Seeds and derived locations

`seed.ts` holds the randomizer settings; `deriveLocations(settings)` turns them
into the list of findable slots. The list is **derived on every render, never stored**.

That's the important call. Storing the slot list would mean reconciling it whenever a setting
changed — a migration problem for something that is a pure function of the settings. Deriving it means
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
wrong under some seed.

It used to hold a capability table behind a "Can I…" panel. That panel was removed at the
maintainer's request, and the table went with it — a model of every obstacle that nothing renders is
just weight. All that survives is the Level 9 gate, which the Triforce panel reads.

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
| Entry points | 1 | 1 | 2 |
| Service worker | no | yes | no |
| Interactive | yes | yes | dock only |
| Panels offered | all | all | six — no overworld |

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
`TrackerSection`. That's enough for the web and desktop apps. To offer it on stream as well, add it
to `OBS_SECTIONS` in `apps/obs/src/options.ts` — that list is both the dock's contents and the
allow-list `allowedSections()` filters `?sections=` against, so an excluded or misspelled name is
dropped instead of rendering an empty panel live. The overworld grid is the deliberate exclusion:
128 cells, each carrying a region code, is unreadable at dock size.

## Testing

```bash
npm test
```

`scripts/test.mjs` bundles every `packages/**/*.test.ts` with esbuild and hands the result to Node's
built-in test runner. The bundle step exists because the sources import each other with `.js`
specifiers that only a bundler resolves; there's no framework and no config.

Coverage is deliberately narrow: the reducer and `migrate` are pure functions over plain data, and
they're where the bugs have actually been. Pure helpers in `packages/ui` are tested the same way —
`collect.ts` and `placed.ts` turn derived locations into actions and labels with no DOM — so logic
worth a test is moved out of a panel into a module like those rather than tested through rendering. `migrate` in particular earned its tests — a plain spread
merge silently kept item keys and dungeon fields that had been removed from the model, so they
survived every load and got written back into exported saves. Browser testing couldn't confirm the
fix (the page wasn't re-executing), which is what prompted the harness.

Rendering isn't covered. It's DOM-patching against a live store; the cost of testing it well is high
and the failure mode is visible the moment you open the page.
