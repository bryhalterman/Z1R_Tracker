# Seeds, settings and item locations

## What the tracker models, and what it doesn't

Z1R has far more flags than this tracker has controls, and that's on purpose. A setting earns a
typed field **only if it changes the tracker's structure** — how many item slots a dungeon has, what
kind they are, or which named locations exist. Everything else is cosmetic, combat-affecting, or
routing trivia, and lives in the free-text **Flags** box, which is stored verbatim and never parsed.

So the Seed panel is:

| Field | Why it's there |
| --- | --- |
| Seed | Bookkeeping — which seed this run is |
| Flags | The whole flag string, stored as typed |
| Dungeon Quest | **Determines every dungeon's item slots** |
| Item Shuffle | Records what pool is in play |
| Shuffle dungeon drops | Triforce / hearts / keys / compass / map join the shuffle |
| Shuffle minor drops | Lets a dungeon hold **extra floor items** |
| Important items in 9 | Ladder, raft, bracelet, recorder, bow may be in Level 9 |
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

### Extra floor slots

`Shuffle Minor Dungeon Drops` folds bomb/rupee/key drops into the shuffle, which the wiki notes
"can allow multiple major items to be found on the floor". There's no way to know in advance how
many, so with that flag on each level grows a **+ floor** button — add slots as you find them.

## Recording a find

Each location row has three parts:

1. **Slot chip** — `FLOOR`, `STAIR`, `HEART` or `OW`. Text, not just a colour.
2. **Item picker** — the 15-item shuffle pool, verbatim from the
   [Dungeon Items flags](https://z1r.wiki/wiki/Dungeon_Items_(Flags)) page. Leave it on `—` if you
   know a slot exists but not what's in it.
3. **Collected checkbox** — you've actually picked it up.

The picker and the checkbox are separate on purpose: a hint can tell you the Raft is in Level 3
long before you can get there, and the tracker should be able to hold "known but not taken".

**Ticking collected also marks the item found.** Unticking never removes it — unwinding an
inventory change from a checkbox is ambiguous once two locations can grant the same thing, so the
tracker refuses to guess. Fix a mistake on the item grid directly.

Heart Containers are the exception: collecting one does **not** bump the heart counter, because
several locations can each hold one and a toggled checkbox would inflate the count. Manage hearts on
the item grid.

## Named overworld locations

Three overworld spots are shuffled independently of dungeons and get their own rows:

- **White Sword Cave** — gated behind 4-6 Heart Containers depending on the shops flags.
- **Armos** — the item under an Armos statue.
- **Coast** — the ladder-only spot on the coast.

## Hint locations

The Overworld panel has a **Hint locations** toggle that pulls in the community hint-location map,
so it's one click away instead of in a browser tab behind OBS. The image is fetched only on first
reveal.
