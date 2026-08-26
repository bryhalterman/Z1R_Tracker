# Map tracker — ideas from other trackers

Scratch notes, not a plan. Nothing here is decided.

## Reference

![Another Z1R tracker's overworld](docs/reference/other-tracker-overworld.png)

A community Z1R tracker, captured 2026-08-07. Same underlying map art we use, but
the overlay is doing considerably more work.

## What it does that we don't

**A checked screen is a full-cell red X.** This is the strongest thing in the
image. By the end of a run most of the map is X'd, and the eye skips all of it
instantly — what's left unmarked *is* the remaining search space. Our `visited`
mark is a small dimmed icon in the centre, which is quiet enough that a cleared
screen and an untouched one look similar at a glance. We made it quiet
deliberately; this suggests the opposite instinct is right. The mark isn't there
to be read, it's there to be *skipped*, and a big X does that better than a
small grey dot.

**Screens carry several facts at once, via corner pips.** Small coloured dots sit
in cell corners — multiple per cell, independent of the main marker. Our model
allows exactly one mark per screen, so a screen that is both a shop and a
bombable wall can't say so. Pips would let secondary attributes ride along
without competing with the centre icon.

**Dungeon entrances draw the staircase sprite plus a large numeral.** Ours draws
a generic cave icon plus a small `7` in the detail line. Theirs is much easier to
pick out of a busy map — the numeral is large and high-contrast.

**Far more marker variety.** The "Overworld Palette" panel is a persistent grid
of every marker: numbered dungeon entrances, bosses, NPCs, cave types. Greyed
entries appear to be unused-so-far. We deliberately cut to seven, and the reasons
still hold — terrain is already visible in the art behind each cell — but the
*boss* icons are interesting, since which boss is in which dungeon is real
randomizer information we have nowhere to put.

**Item locations show sprites, not letter codes.** Their `L1`…`L8` rows carry the
actual item art inline. We show `F` / `S` / `H` chips and only draw the sprite
once an item is known. Sprites read faster.

## What we already do better

- Marks carry structured detail — which level, what a shop sells, what blocked
  you. Theirs looks like icon-only.
- Hint regions are built into the grid; a hint lights up its screens.
- The map is one canvas, sharp at any dock size.
- Everything survives without colour vision. A palette that leans on coloured
  pips would need care here — pips are small, and small plus colour-only is the
  worst combination for it.

## Candidates, cheapest first

1. Make `visited` a bold full-cell X. Small change, probably the biggest single
   readability win in the list.
2. Larger, higher-contrast dungeon numerals.
3. Sprites instead of letter chips in the compact location rows.
4. Corner pips for secondary attributes — needs a model change (a screen would
   gain a set of tags alongside its mark) and needs a non-colour channel per pip.
5. Boss-per-dungeon tracking. Real information, no obvious home yet; possibly
   belongs with the dungeon's blockers rather than on the map.
