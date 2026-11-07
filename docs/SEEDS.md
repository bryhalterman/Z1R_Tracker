# Seeds, settings and item locations

## What the tracker models, and what it doesn't

Z1R has far more flags than this tracker has controls, and that's on purpose. A setting earns a
typed field **only if it changes the tracker's structure** — how many item slots a dungeon has, what
kind they are, or which named locations exist. Everything else is cosmetic, combat-affecting, or
routing trivia, and lives in the free-text **Flags** box, which is stored verbatim and never parsed.

So the seed settings are:

| Field | Why it's there |
| --- | --- |
| Seed | Bookkeeping — which seed this run is |
| Flags | The whole flag string, stored as typed |
| Dungeon Quest | **Determines every dungeon's item slots** |
| Overworld Quest | Which overworld map the map panel is drawn on |
| Item Shuffle | Records what pool is in play |
| Shuffle dungeon drops | Triforce / hearts / keys / compass / map join the shuffle |
| Shuffle minor drops | Records that a dungeon can hold **extra floor items** |
| Important items in 9 | Ladder, raft, bracelet, recorder, bow may be in Level 9 |
| Mirrored overworld | Flips the overworld map and its hint regions left to right |
| Quest split | Which quest levels 1-6 and 7-9 turned out to be |
| Notes | Hints, routing, anything |

## Floor items vs stair items

This is the distinction the location panel is built around, and it comes straight from the
[Dungeon Quest tables](https://z1r.wiki/wiki/Dungeon_Quest):

- **Floor** — the item is lying in a room, visible on the dungeon floor.
- **Stair** — the item is behind a staircase, in an item basement.

Which one a level has is fixed by the quest, not by the seed:

| Level | 1st Quest | 2nd Quest |
| --- | --- | --- |
| 1 | floor + stair | floor |
| 2 | floor | stair |
| 3 | stair | floor |
| 4 | stair | stair ×2 |
| 5 | stair | stair |
| 6 | stair | stair |
| 7 | stair | stair |
| 8 | stair ×2 | stair ×2 |
| 9 | stair ×2 | stair ×2 |

Both quests hold 12 dungeon items. Every level except 9 also has a Heart Container.

Change the **Dungeon Quest** dropdown and the location list re-shapes to match. Nothing is lost when
you do: entries are keyed by slot id, so switching to 2nd Quest and back leaves what you'd already
recorded intact.

### The quest split

`Mixed Quest` guarantees levels 1-6 come from one quest and 7-9 from the other — but not which way
round, and you don't find out until you're in the seed. The `Random` options are the same problem.

For those, a **Quest split** control appears: set L1-6 as you discover it and L7-9 flips
automatically, because Mixed can't have both halves from the same quest. Fixed quests hide the
control entirely, since it can't do anything.

`Shapes` follows First Quest item logic, per the wiki, so it's treated as 1st Quest here.

### Extra floor items

`Shuffle Minor Dungeon Drops` folds bomb/rupee/key drops into the shuffle, which the wiki notes
"can allow multiple major items to be found on the floor". There's no way to know in advance how
many, and there is no slot to add for them: record the item in its room, and once the level's floor
spots are full it is listed as an extra chip beside that level's slots.

## Recording a find

Item locations are read off the maps, not entered slot by slot. Record an item where you found it —
drag it from the palette onto a room on the level sheet or onto an overworld screen — and the slot
it fills shows in the **Item locations** columns: a column per level, a chip per slot, lettered by
kind (`F` floor, `S` stair, `H` heart) or by overworld spot (`WS`, `AR`, `CO`). The items
that can go in a slot are the shuffle pool from the
[Dungeon Items flags](https://z1r.wiki/wiki/Dungeon_Items_(Flags)) page.

A chip toggles **collected** on the room or screen it was read from. Recording an item and taking it
are separate on purpose: a hint can tell you the Raft is in Level 3 long before you can get there,
and the tracker should be able to hold "known but not taken".

**Collecting also marks the item held.** Un-collecting never removes it — unwinding an inventory
change from a chip is ambiguous once two locations can grant the same thing, so the tracker refuses
to guess. Fix a mistake in the item palette directly.

Heart Containers are the exception: they're placeable, so they get location slots, but there's no
inventory item to mark. Your heart total is on the game's HUD.

## Named overworld locations

Three overworld spots are shuffled independently of dungeons and get their own chips, in the `OW`
column:

- **White Sword Cave** — gated behind 4-6 Heart Containers depending on the shops flags.
- **Armos** — the item under an Armos statue.
- **Coast** — the ladder-only spot on the coast.

## Hints

A Z1R hint pairs a **subject** with an **overworld region** — "Digdogger gazes… By a Lake". The
tracker models exactly that.

### Regions on the map

The overworld grid labels every screen with its hint region:

| Code | Region | Code | Region |
| --- | --- | --- | --- |
| `DM` | Death Mountain | `LK` | By a Lake |
| `GR` | At the Grave | `CO` | The Coast |
| `DW` | The Dead Woods | `FO` | The Forest |
| `RV` | The River | `LH` | The Lost Hills |
| `CS` | Close to Start | `DE` | The Desert |

The **Regions** toggle in the Overworld panel turns the codes off if you want a plain grid; **Hint
map** still opens the original wiki reference image.

The region table was extracted from that map by matching each screen against the map's flat fill
colors — every screen resolved at ≥92% agreement, so this isn't eyeballed.

### The hint log

Each row in the **Hints** log is one hint:

1. **Subject** — a dungeon, listed by the phrase you actually hear (`Digdogger gazes… (L5)`), or an
   item from the shuffle pool.
2. **Region** — one of the ten above.
3. **Show** — lights that region's screens up on the overworld. The button reads **Show** with an
   empty circle, or **On map** with a filled one, so its state is legible without color. On OBS the
   overworld is in the map dock, beside the hint log; see [OBS.md](OBS.md).
4. **Heard at** and **note** — optional bookkeeping.

Both halves are optional. You often note the subject before the region, or vice versa, and a
half-recorded hint still narrows the map.

Picking a region focuses it immediately, since that's almost always what you wanted next. Clicking
**On map** again clears the highlight.

## Mirrored overworld

The **Mirrored overworld** checkbox flips the map left to right — `A1` becomes `A16`. The hint
regions flip with it, which is why the wiki has no separate mirrored hint map: the same table
reflects. Turn it on and the grid's region codes reverse to match what you're actually looking at.
