# Z1R Tracker user guide

This guide covers every panel and control in the tracker,
in the order you meet them during a Zelda 1 Randomizer run.
Set up the seed first, then record finds from the Items palette,
the overworld map, and the dungeon room map.
The Locations panel and the Triforce fill in from what you place on the maps.

## Open the tracker

The tracker ships in three forms that share one codebase:

| Form | How to open it | Use it when |
| --- | --- | --- |
| Web | Open <https://bryhalterman.github.io/Z1R_Tracker/> | You want nothing to install |
| Desktop | Unzip the release and open `index.html`, or run `start.cmd` or `start.sh` | You play offline |
| OBS | Run `npm run start:obs` and add its pages to OBS | You stream the run |

The OBS form splits the tracker into a read-only overlay and clickable docks.
See the [OBS setup guide](OBS.md) for the walkthrough.

Every panel has a ▾ arrow beside its title.
Click it to collapse or expand the panel.
The tracker remembers which panels you collapsed.

## Know the page layout

The page stacks five areas from top to bottom:

| Area | What it holds |
| --- | --- |
| Header | Export, Import, and Reset |
| Seed | The seed number, flag string, and the settings that change the tracker's shape |
| Hints | One row per hint you hear in the game |
| Items | The item palette, with the Locations panel and Triforce beside it |
| Overworld and Levels | The overworld map on the left, the dungeon room map on the right |

On a narrow window the areas wrap so the page still fits the window width.

## Set up the seed

Fill in the **Seed** panel before you start playing.
Only the fields that change what the tracker shows are controls;
everything else goes in **Flags** or **Notes**.

| Field | What it does |
| --- | --- |
| Seed | Stores the seed number for your own reference |
| Flags | Stores the full flag string as typed; the tracker never reads it |
| Dungeon Quest | Sets how many item slots each level has and whether each is a floor or stair slot |
| Item Shuffle | Records which item pool is in play |
| Shuffle dungeon drops | Records that the Triforce, hearts, keys, compass, and map join the shuffle |
| Shuffle minor drops | Records that a level can hold extra floor items |
| Important items in 9 | Records that the Ladder, Raft, Bracelet, Recorder, or Bow may be in Level 9 |
| Mirrored overworld | Flips the overworld map and its hint regions left to right |
| Notes | Free text for anything else |

**Dungeon Quest** offers 1st Quest, 2nd Quest, Mixed Quest, Shapes,
Mixed + Shapes,
Random No Shapes, and Random.
When the quest choice leaves it open which quest each half of the game uses,
a **Quest split** control appears.
Set **L1-6** and **L7-9** once you know which quest each half turned out to be.

The per-quest slot tables and the region data are in
the [seeds and item locations notes](SEEDS.md).

## Track items with the palette

The **Items** panel is a palette.
You arm an item, then click where you found it.
The line beside the panel title always says what your next click does.

### Place an item you found

1. Click the item in the palette.
   It gets a ring, and the panel title reads, for example, "Bow armed —
   click a room or an overworld screen."
1. Click the room on the dungeon map, or the screen on the overworld map,
   where you found it.

The item lands there and the palette puts it down, so one find is one placement.
To put an armed item down without placing it, click it again or press **Esc**.
Placing the same item on the same room or screen again removes it.

Each item only lands where it can appear in the game:

- Rooms take shuffle-pool items, Bombs, and the dungeon pickups.
- Overworld screens take shuffle-pool items, Bombs,
  and the overworld-only items.
- A click on a place that cannot hold the armed item does nothing.

### Pick a tier for an item that upgrades

Sword, Boomerang, Candle,
and Potion each have one palette cell that shows the tier you hold.
Click the cell to open a small picker of the tiers you can find,
then pick the one you just found to arm it:

- Sword: Wooden Sword, White Sword, Magical Sword
- Boomerang: Boomerang, Magical Boomerang
- Candle: Blue Candle, Red Candle
- Potion: Blue Potion, Red Potion

Click outside the picker or press **Esc** to close it.
The Arrow and Ring cells have one findable tier each,
so a click arms the Silver Arrow or the Red Ring directly.

### Mark an item held without placing it

Some items are never found on a map, such as what you buy or start with.
Right-click a palette cell to raise that item one stage,
and Shift+right-click to lower it.
With the keyboard, focus the cell and use the Right or Up arrow to raise it,
and the Left or Down arrow to lower it.

Held items have a solid border; items you do not hold have a dashed border.
An item that has been placed somewhere lists where in its tooltip.

### Know the palette groups

The palette has three groups:

| Group | Items |
| --- | --- |
| Main | Sword, Boomerang, Bow, Arrow, Candle, Ring, Recorder, Wand, Magical Key, Bombs, Potion |
| Held | Book, Magical Shield, Ladder, Raft, Power Bracelet, Meat, Letter |
| Dungeon | Heart Container, Map, Compass, Triforce piece |

The dungeon pickups have no held state, so right-click does nothing on them.
The game's own HUD already shows your hearts.

## Map the overworld

The **Overworld** panel is the 16-by-8 screen map with a toolbar above it.
The toolbar works two ways:

- **Select a screen, then edit it.**
  With nothing armed, click a screen.
  The toolbar now shows and edits that screen, and its label names it,
  for example `H2`.
- **Arm a mark, then stamp screens.**
  Click a mark in the toolbar, then click as many screens as you like.
  Each stamped screen is also selected, so you can refine it right away.
  Click the mark again to stop.

Right-click a screen to clear its mark.
With a screen focused, the Left and Right arrows step through the marks.
Press **Esc** to let go of the selected screen.

### Choose a mark

The toolbar marks are icons; hover one to see its name.

| Mark | Use it for | Details you can add |
| --- | --- | --- |
| Clear (—) | Removing marks | None |
| Dungeon | A dungeon entrance | Level, and what blocks the entrance |
| Shop | A shop | What it sells, and each price |
| Item | A screen that holds an item | Which named spot it is, which item, and Collected |
| Gambling | A gambling cave | None |
| Hint room | A hint cave | None |
| Door repair | A cave that charges you for the door | None |
| Rupee secret | A cave that gives rupees | Size |
| Warp | One of the four warp staircases | Which warp, 1 to 4 |
| Checked, nothing | A screen you checked that has nothing to come back for | None |

A screen with no mark has not been checked yet,
so leave screens unmarked until you have been there.

### Fill in a dungeon entrance

Select a Dungeon screen, or arm the Dungeon mark, and pick the level number.
When the Dungeon mark is armed, pick a level before stamping;
the toolbar label reads "Pick a level" until you do.

Under **Blocked by**, toggle what kept you out:
Locked door, Bomb wall, Ladder gap, Needs the Bow, or Needs the Recorder.

### Record a shop

Select a Shop screen.
Under **Sells**, toggle each item on offer:
Bombs, Keys, Arrows, Potion, Blue Ring, Meat, Heart Container, Magical Shield,
or Blue Candle.
Each toggled item enables its price box.
Type the price there; clear the box to remove it.

### Record a rupee secret

Select a Rupee secret screen, or arm the mark, and pick a size:

| Size | Rupees when shop items are shuffled |
| --- | --- |
| S, small | 1–20 |
| M, medium | 25–40 |
| L, large | 50–150 |

The size is optional.

### Record an overworld item

Arm an item in the palette and click the screen,
or select an Item screen and use the toolbar:

- **Item spot** names which of the three shuffled spots the screen is:
  White Sword Cave, Armos, or Coast.
  An unnamed spot keeps the item on the map but fills no location slot.
- **Item** sets which item is there.
- **Collected** marks the item picked up and marks it held in the palette.
  Turning it back off leaves the item held.

The Coast spot needs the Ladder.
The map shows it as unreachable until you hold the Ladder, and reachable after.

### Mark the start screen and the warps

The pennant button at the end of the mark row places the start screen.
A map has one start screen, so placing it again moves it.

The Warp mark carries a number from 1 to 4.
The panel title counts them, for example "Warps 2/4".
The table above the map shows, for each warp, its screen and where its left,
middle,
and right staircases come out.
Rows fill in as you mark the warps.

### Show hint regions

Click **Regions** in the panel title
to label every screen with its two-letter hint region code,
such as `DM` or `LK`.
Click it again to hide the codes.

### Clear the map

**Clear** in the panel title removes every overworld mark after a confirmation.
Items in your inventory and the Triforce are not affected.

## Map a dungeon

The **Levels** panel is the room map for one level at a time.
Pick the level with the numbers 1 to 9 in the panel title.
The title also counts the rooms you have recorded on that level.

Click a room to select it and mark it visited.
A visited room is drawn as an inked box; an unvisited room is bare paper.
The strip beside or under the map edits the selected room.

### Use the room toggles

The top row of the strip has five buttons:

| Button | What it does |
| --- | --- |
| Visited | Marks the room walked, or removes the mark |
| Entrance | Makes this the room you enter the level by; a level has one, shown by the pennant |
| Ladder | Marks water in the room that needs the Ladder |
| Chute | Steps through no chute, vertical (↕), and horizontal (↔) |
| Wipe | Forgets everything recorded about the room |

A room marked Ladder shows the Ladder in its top-right corner.
Once you hold the Ladder the icon dims and gets a check mark,
so the room reads as passable.

A chute room shows two bars across the room in the direction the chute runs,
the same way its two rows of blocks sit on screen.

### Record the room's item

Place an item in a room from the palette.
The **Item** row then shows it, with two buttons:

- **Collected** marks it picked up, which also marks it held in the palette.
  Turning it back off leaves the item held.
- **Clear** removes the item from the room.

The **From** row says which location slot the item fills:

- **Auto** reads it from the room: a room with item stairs holds a stair item,
  any other room a floor item.
- **Floor** fills one of the level's floor spots, which include the heart spot.
- **Stair** fills one of the level's stair slots.

A Heart Container fills the heart spot first.
Any other floor item fills an ordinary floor spot first,
and only takes the heart spot when the ordinary ones are full.
An item shows as an extra slot only when every floor spot in the level is full.
The Map, Compass, and Triforce piece fill no slot,
so the From row hides for them.

### Record the boss

Pick the boss from the **Boss** row.
Ganon and Princess Zelda appear for Level 9 only.
Click the selected boss again, or **none**, to clear it.

### Record the stairs

The **Stairs** row has three choices:

- **None** for no staircase.
- **To item** for stairs down to an item basement.
  The room shows the staircase icon.
- **Transport** for one end of a transport staircase.

A transport staircase gets the lowest free pair number, 1 to 4,
and the room shows that number.
The two rooms with the same number are the two ends of one staircase.
Click a different number to change the pair,
or click the selected number again to unpair the room and keep the staircase.
A third room given a number already used by two rooms
replaces the room that has held it longest.

### Record the doors

The **Doors** row works like a paint brush:

1. Pick a door state, or press its number key.
1. Click the walls of the room drawing to paint them.

| Key | State | Meaning |
| --- | --- | --- |
| 1 | Open | An open doorway |
| 2 | Locked | A door that needs a key |
| 3 | Shutter | A door that closes until the room is cleared |
| 4 | Wall | A solid wall |
| 5 | Bombed | A wall you bombed that did not open |
| 6 | Clear | Unknown, the starting state |

The state stays picked until you choose another,
so four open doors take five clicks.
Clicking a wall that already shows the picked state resets it to unknown,
and right-clicking a wall always does.
The number keys work anywhere on the page except in text fields.

### Clear a level

**Clear** in the panel title wipes the selected level's room map
after a confirmation.
The other levels are not affected.

## Read item locations and the Triforce

The **Locations** panel sits in the Items card.
It has one column per level plus `OW` for the overworld,
and one chip per item slot in that level.
The title counts collected slots against all slots, for example "3/23".

The panel is read-only for items:
each chip fills in from what you place on the maps.
Until a slot's item is known, the chip shows its kind:

| Code | Slot |
| --- | --- |
| F | A floor slot |
| H | The level's heart spot |
| S | A stair slot |
| WS | White Sword Cave |
| AR | Armos |
| CO | Coast |

A known item shows its sprite.
A collected slot has a solid border; an uncollected one has a dashed border.
Click or right-click a chip
to toggle Collected on the room or screen it came from.
A level with more floor items than spots
grows extra chips at the bottom of its column.

The triangle heading each column for Levels 1 to 8
is that level's Triforce piece.
Click it to mark the piece collected or not collected.
Level 9 holds Ganon and has no piece.

## Log hints

The **Hints** panel holds one row per hint.
Click **+ Hint** to add a row, and **×** to remove one.

Each row has five fields:

1. **Subject** is the dungeon, listed by the phrase you hear,
   such as "Digdogger gazes… (L5)",
   or an item from the shuffle pool.
1. **Region** is where the hint points, such as "LK · By a Lake".
   Picking a region also shows it on the map.
1. **Show** highlights the region's screens on the overworld map.
   It reads "◉ on map" while the region is shown,
   and the map title names the region.
   Click it again to hide the highlight.
1. **Heard at** is the screen where you heard the hint, for example `H2`.
1. **Note** is free text.

## Save, export, and reset

The tracker saves to your browser after every change,
so a closed tab picks up where you left off.
The header has three buttons:

- **Export** downloads the run as a JSON file.
- **Import** loads a JSON file
  and replaces the current run after a confirmation.
- **Reset** clears the current run after a confirmation.

A save lives in one browser on one machine.
Export the run to move it to another browser or keep a backup.

## Use the shortcuts

The tracker has these mouse and keyboard shortcuts:

| Where | Input | Effect |
| --- | --- | --- |
| Palette | Click | Arm the item, or open its tier picker |
| Palette | Right-click | Raise the item one stage |
| Palette | Shift+right-click | Lower the item one stage |
| Palette | Right or Up arrow | Raise the focused item |
| Palette | Left or Down arrow | Lower the focused item |
| Anywhere | Esc | Put the armed item down, or close the tier picker |
| Overworld | Right-click a screen | Clear its mark |
| Overworld | Left or Right arrow on a screen | Step through the marks |
| Overworld | Esc | Let go of the selected screen |
| Levels | 1 to 6 | Pick a door state |
| Levels | Right-click a wall | Reset the wall to unknown |
| Locations | Click or right-click a chip | Toggle Collected |

## Read the tracker without color

No state in the tracker is signaled by color alone.
Held items and collected slots have a solid border, and the rest a dashed one.
Marks, staircases, ladders, chutes,
and door states are drawn shapes or carry a text code,
and every control names its state in its tooltip.
The full rule is in the [architecture notes](ARCHITECTURE.md#accessibility).
