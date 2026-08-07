# OBS setup

The OBS build is three pages that share one run:

- **`overlay.html`** — transparent, read-only, goes on stream.
- **`dock.html`** — the tracker you click. Stays inside OBS, never on stream.
- **`map.html`** — the overworld on its own, so it can be sized and left alone.

The overlay is separate because OBS browser sources ignore clicks unless you opt in, and even with
clicks enabled a stray one during a run would edit the tracker live on camera. The map is separate
because it wants room, and sharing a column with everything else meant scrolling past the tracker
to reach it mid-run.

Requires OBS 28 or newer.

## 0. Which page is which

Four pages ship, and the names matter:

| Page | What it is |
| --- | --- |
| `index.html` | A setup page. Lists the others with their full URLs — open it first. |
| `overlay.html` | The read-only overlay. Goes on stream as a Browser Source. |
| `dock.html` | The interactive tracker. Goes in OBS as a Custom Browser Dock. |
| `map.html` | The overworld map. A second Custom Browser Dock. |

The overlay used to live at `index.html`, which meant a dock pointed at the root URL loaded a page
with every control disabled and nothing explaining why. If you hit that, the overlay now says so
when clicked.

## 1. Get a build

```bash
npm run start:obs
```

That builds `apps/obs/dist` and serves it on <http://127.0.0.1:4178>. Leave it running while you
stream. `npm run build:obs` and `npm run serve:obs` are the two halves if you want them separately.

Serve it rather than ticking **Local file**: the two pages only sync when they share an origin, and
`file://` pages don't (see *Same-origin*). The server also sends `no-store`, so a rebuild shows up
on a plain refresh instead of needing **Refresh cache of current page**.

## 2. Add the overlay

**Sources → + → Browser**

| Field | Value |
| --- | --- |
| Local file | ✖ unchecked |
| URL | `http://127.0.0.1:4178/overlay.html?width=420` |
| Width / Height | `420` × `700` to start |
| Shutdown source when not visible | ✖ unchecked |
| Refresh browser when scene becomes active | ✖ unchecked |

Leave **Control audio via OBS** off. Do not enable interaction on this source.

Those two unchecked boxes matter: either one will reload the page on a scene change, and a reload
re-reads state from storage — briefly flashing an empty tracker on stream.

### Tuning it

Append query parameters to the URL:

```
http://127.0.0.1:4178/overlay.html?sections=items,hintlog&size=32&width=500
```

| Parameter | Default | Meaning |
| --- | --- | --- |
| `sections` | `items,dungeons` | Any of `seed`, `items`, `dungeons`, `locations`, `hintlog`, `hints` |
| `size` | `40` | Item cell size in pixels |
| `width` | `420` | Composition width — the layout is built at this width, then scaled to fit the source |
| `scale` | auto | Pins the scale factor and turns auto-fit off |

`width` is the one to reach for. The overlay lays out at a fixed width and scales that whole
composition to fit the source, the way a stream graphic should behave — so dragging the source
resizes the tracker instead of reflowing it. A **narrower** `width` means fewer items per row and a
taller, chunkier overlay; a **wider** one means long rows and finer detail. Set it to the shape you
want, then drag the source to whatever size suits the scene.

A vertical item strip beside a 4:3 game capture is usually `?sections=items&size=36`. Add
`dungeons` if you're tracking a full randomizer seed.

Anything not in that list is dropped, not rendered. Misspell a name, or ask for a panel the OBS
build doesn't carry, and you lose that panel rather than getting an empty box on stream. The list
lives in `apps/obs/src/options.ts` as `DOCK_SECTIONS`.

### No overworld map on stream

The overworld grid isn't offered to the overlay. It's 128 cells carrying marks, dungeon numbers and
stock codes — worth reading in a window you can size, pointless as a static graphic over a game
capture. It has its own dock instead; see below.

The overlay has no background by design. If you want a backing plate, add a Color Source behind it
in OBS rather than styling one in — that way it stays independent of the tracker's own layout.

### Custom CSS

OBS pre-fills the source's **Custom CSS** box with this:

```css
body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }
```

**Leave it.** It is a no-op here — the overlay already sets all three to the same values, and
`body.overlay` outranks a bare `body` selector — but it is also exactly right, so there is nothing
to gain by clearing it.

Two overrides are supported if you want them:

```css
/* Remove the 8px inset so the tracker fills the source edge to edge. */
body { --overlay-pad: 0px; }

/* Backing plate, if a Color Source is more trouble than it's worth. */
.z1r-tracker { background: rgba(0, 0, 0, .55); border-radius: 6px; }
```

Use `--overlay-pad`, not `padding`. The auto-fit reads that variable when it measures, so the scale
stays correct; setting `padding` directly both loses on specificity and desynchronises the fit.

Don't set `zoom` or `transform` on the body. The overlay already transforms itself to fit, and a
second one compounds rather than replaces it. Change `?width=` instead.

## 3. Add the dock

**Docks → Custom Browser Docks…**

| Field | Value |
| --- | --- |
| Dock Name | `Z1R Tracker` |
| URL | `http://127.0.0.1:4178/dock.html` |

Apply, then drag the dock wherever you like. Click in it and the overlay updates immediately.

This carries the seed, items, Triforce, locations and hints — everything except the map.

## 4. Add the map dock

**Docks → Custom Browser Docks…** again:

| Field | Value |
| --- | --- |
| Dock Name | `Z1R Map` |
| URL | `http://127.0.0.1:4178/map.html` |

The overworld on its own. It's a separate window because it wants to be large and to stay put —
sharing a column with the seed form and the inventory meant it was either squeezed narrow or
reached by scrolling past everything else, mid-run, which is when neither is acceptable.

Dock it along the bottom or on a second monitor and give it room. Marking a screen here shows up in
the main dock and on the overlay at once; they are one run, not two.

It has no Export/Import/Reset bar. Those live in the main dock, and a second Reset button on a
single-panel window is a way to lose a run by misclick.

## Same-origin

The pages sync through `localStorage` and a `BroadcastChannel`, both of which are scoped to an
**origin**. If they don't share one, they will silently track separate runs.

That means:

- Both from the same HTTP address → same origin. ✔
- Both from the same hosted URL → same origin. ✔
- Dock from a hosted URL, overlay from a local file → **different origins**. ✘
- Both from the same local folder over `file://` → **don't rely on it.** ✘

That last one is the trap, because it looks like it should work. A `file://` page has an opaque
origin in the browser OBS embeds, so `BroadcastChannel` — the half that makes an edit in the dock
show up on stream immediately — has nothing to deliver to. You can end up with edits that appear
only after a reload, or not at all. Serve the folder over HTTP (`npm run serve:obs`) and the
problem doesn't arise.

Pick one address and use it for all three.

## Troubleshooting

**The overlay doesn't change when I click the dock.**
Different origins — see above. Check that both URLs start the same way.

**Everything shows two-letter boxes instead of icons.**
That's the glyph fallback, and it means the art host is unreachable from the machine OBS is running
on — every item key ships with a URL. If only the level numerals `1`…`9` are boxes, that's
expected: they have no art and don't need any. See [SPRITES.md](SPRITES.md).

**The overlay went blank after a scene switch.**
"Shutdown source when not visible" is checked. Uncheck it.

**The overlay has a black background.**
The source was added as a Window Capture or a Media Source rather than a Browser Source, or a
custom CSS block in the source's properties set a background. The default custom CSS OBS pre-fills
(`background-color: rgba(0,0,0,0);`) is correct — leave it.

**The overlay shrinks as I resize the source.**
Fixed — rebuild and refresh. The fit measured the visual viewport rather than the layout one and
nothing clipped the overrun, so a scrollbar appeared, which narrowed the viewport, which shrank the
next fit. If you still see it, check you haven't added `zoom` or `transform` in Custom CSS.

**I rebuilt and the source still shows the old version.**
Only happens if you're loading from `file://` or through some other server. `npm run serve:obs`
sends `no-store`. Otherwise: right-click the source → **Refresh cache of current page**.

**I want the overlay clickable instead of the dock.**
Enable *Interact* on the browser source and load `dock.html` in it. It works, but every click lands
on the stream, which is why it isn't the default.
