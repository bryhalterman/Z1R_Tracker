# OBS setup

The OBS build is two pages that talk to each other:

- **`index.html`** — the overlay. Transparent, read-only, goes on stream.
- **`dock.html`** — the tracker you actually click. Stays inside OBS, never on stream.

They're split because OBS browser sources ignore clicks unless you opt in, and even with clicks
enabled a stray one during a run would edit the tracker live on camera.

Requires OBS 28 or newer.

## 0. Which page is which

Three pages ship, and the names matter:

| Page | What it is |
| --- | --- |
| `index.html` | A setup page. Lists the other two with their full URLs — open it first. |
| `overlay.html` | The read-only overlay. Goes on stream as a Browser Source. |
| `dock.html` | The interactive tracker. Goes in OBS as a Custom Browser Dock. |

The overlay used to live at `index.html`, which meant a dock pointed at the root URL loaded a page
with every control disabled and nothing explaining why. If you hit that, the overlay now says so
when clicked.

## 1. Get a build

```bash
npm run build:obs
```

The result is in `apps/obs/dist`. You can also point OBS at the hosted Pages build — see
*Same-origin* below for the one rule that matters.

## 2. Add the overlay

**Sources → + → Browser**

| Field | Value |
| --- | --- |
| Local file | ✔ checked |
| Local file path | `apps/obs/dist/overlay.html` |
| Width / Height | `420` × `700` to start |
| Shutdown source when not visible | ✖ unchecked |
| Refresh browser when scene becomes active | ✖ unchecked |

Leave **Control audio via OBS** off. Do not enable interaction on this source.

Those two unchecked boxes matter: either one will reload the page on a scene change, and a reload
re-reads state from storage — briefly flashing an empty tracker on stream.

### Tuning it

Append query parameters to the local file path:

```
apps/obs/dist/overlay.html?sections=items,hintlog&size=32&scale=1.25
```

| Parameter | Default | Meaning |
| --- | --- | --- |
| `sections` | `items,dungeons` | Any of `seed`, `items`, `dungeons`, `locations`, `hintlog`, `hints` |
| `size` | `40` | Item cell size in pixels |
| `scale` | `1` | Scales the whole overlay |

A vertical item strip beside a 4:3 game capture is usually `?sections=items&size=36`. Add
`dungeons` if you're tracking a full randomizer seed.

Anything not in that list is dropped, not rendered. Misspell a name, or ask for a panel the OBS
build doesn't carry, and you lose that panel rather than getting an empty box on stream. The list
lives in `apps/obs/src/options.ts` as `OBS_SECTIONS`, and the dock shows the same six in the same
order.

### No overworld map on stream

The overworld grid isn't available to either OBS page. It's 128 cells with a two-letter region code
on each — legible in a browser window, unreadable squeezed into a dock beside a game capture, and
pointless as a static overlay. Overworld tracking lives in the web and desktop apps, which have the
room for it. If you want it during a run, keep one of those open on a second monitor.

The overlay has no background by design. If you want a backing plate, add a Color Source behind it
in OBS rather than styling one in — that way it stays independent of the tracker's own layout.

## 3. Add the dock

**Docks → Custom Browser Docks…**

| Field | Value |
| --- | --- |
| Dock Name | `Z1R Tracker` |
| URL | `file:///C:/path/to/apps/obs/dist/dock.html` |

Apply, then drag the dock wherever you like. Click in it and the overlay updates immediately.

## Same-origin

The two pages sync through `localStorage` and a `BroadcastChannel`, both of which are scoped to an
**origin**. If the dock and the overlay don't share one, they will silently track two separate runs.

That means:

- Both from the same local folder → same origin. ✔
- Both from the same hosted URL → same origin. ✔
- Dock from a hosted URL, overlay from a local file → **different origins**. ✘

Pick one and use it for both.

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

**I want the overlay clickable instead of the dock.**
Enable *Interact* on the browser source and load `dock.html` in it. It works, but every click lands
on the stream, which is why it isn't the default.
