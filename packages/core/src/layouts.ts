/**
 * Dungeon room layouts: what stands on a room's floor.
 *
 * The game draws every dungeon room from one of 42 layouts — a grid of 12
 * columns by 7 rows of squares, shared by every level of both quests. Two
 * randomizer seeds checked against the original carry the identical table.
 * That makes the layout something a runner can recognise and write down, and
 * the shape of a room is often the quickest way to say which one you mean.
 *
 * The grids were read out of the game's own layout table — 12 column ids per
 * layout at file offset `0x160EE`, columns decoded from the heap the pointers
 * at `0x16714` lead to — so they are complete rather than collected from maps.
 * Entries past `0x29` in that table are filler no room uses. What the tracker
 * keeps is the shape only, one character per square: a fact about the game,
 * not its art.
 *
 * Squares:
 *
 * | Char | Square                                |
 * | ---- | ------------------------------------- |
 * | `.`  | floor                                 |
 * | `#`  | block                                 |
 * | `o`  | statue                                |
 * | `=`  | staircase, part of the layout itself  |
 * | `~`  | water                                 |
 * | `:`  | sand                                  |
 * | `x`  | black floor                           |
 */

/** Width and height of a layout, in squares. */
export const ROOM_LAYOUT_COLUMNS = 12;
export const ROOM_LAYOUT_ROWS = 7;

export type RoomLayoutSquare = '.' | '#' | 'o' | '=' | '~' | ':' | 'x';

/** How the picker files a layout: by what fills the room. */
export type RoomLayoutGroup = 'open' | 'blocks' | 'water' | 'floor';

export const ROOM_LAYOUT_GROUPS: readonly { id: RoomLayoutGroup; name: string }[] = [
  { id: 'open', name: 'Open' },
  { id: 'blocks', name: 'Blocks' },
  { id: 'water', name: 'Water' },
  { id: 'floor', name: 'Floor' },
];

export interface RoomLayoutDef {
  /** Stable id stored in saves. Never renumbered. */
  readonly id: string;
  readonly name: string;
  readonly group: RoomLayoutGroup;
  /** The layout's index in the game's own table, for cross-reference only. */
  readonly code: number;
  /** `ROOM_LAYOUT_ROWS` strings of `ROOM_LAYOUT_COLUMNS` squares, north first. */
  readonly rows: readonly string[];
}

export const ROOM_LAYOUTS: readonly RoomLayoutDef[] = [
  {
    id: 'empty',
    name: 'Empty',
    group: 'open',
    code: 0x00,
    rows: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  {
    id: 'single-block',
    name: 'Single block',
    group: 'open',
    code: 0x22,
    rows: [
      '............',
      '............',
      '............',
      '.....#......',
      '............',
      '............',
      '............',
    ],
  },
  {
    id: 'two-blocks',
    name: 'Two blocks',
    group: 'open',
    code: 0x0a,
    rows: [
      '............',
      '............',
      '............',
      '....#..#....',
      '............',
      '............',
      '............',
    ],
  },
  {
    id: 'two-statues',
    name: 'Two statues',
    group: 'open',
    code: 0x23,
    rows: [
      '............',
      '............',
      '............',
      '....o..o....',
      '............',
      '............',
      '............',
    ],
  },
  {
    id: 'corner-statues',
    name: 'Corner statues',
    group: 'open',
    code: 0x24,
    rows: [
      'o..........o',
      '............',
      '............',
      '............',
      '............',
      '............',
      'o..........o',
    ],
  },
  {
    id: 'four-blocks',
    name: 'Four blocks',
    group: 'open',
    code: 0x02,
    rows: [
      '............',
      '............',
      '..#......#..',
      '............',
      '..#......#..',
      '............',
      '............',
    ],
  },
  {
    id: 'four-blocks-wide',
    name: 'Four blocks wide',
    group: 'open',
    code: 0x03,
    rows: [
      '............',
      '..#......#..',
      '............',
      '............',
      '............',
      '..#......#..',
      '............',
    ],
  },
  {
    id: 'arrows',
    name: 'Arrows',
    group: 'open',
    code: 0x01,
    rows: [
      '............',
      '............',
      '..#......#..',
      '.#........#.',
      '..#......#..',
      '............',
      '............',
    ],
  },
  {
    id: 'low-blocks',
    name: 'Low blocks',
    group: 'open',
    code: 0x06,
    rows: [
      '............',
      '............',
      '............',
      '.#........#.',
      '............',
      '...#....#...',
      'o..........o',
    ],
  },
  {
    id: 'center-block',
    name: 'Center block',
    group: 'blocks',
    code: 0x1e,
    rows: [
      '............',
      '............',
      '.....##.....',
      '.....##.....',
      '.....##.....',
      '............',
      '............',
    ],
  },
  {
    id: 'twin-blocks',
    name: 'Twin blocks',
    group: 'blocks',
    code: 0x1d,
    rows: [
      '............',
      '............',
      '..##....##..',
      '..##....##..',
      '..##....##..',
      '............',
      '............',
    ],
  },
  {
    id: 'five-pairs',
    name: 'Five pairs',
    group: 'blocks',
    code: 0x1f,
    rows: [
      '............',
      '.##......##.',
      '............',
      '.....##.....',
      '............',
      '.##......##.',
      '............',
    ],
  },
  {
    id: 'diamond',
    name: 'Diamond',
    group: 'blocks',
    code: 0x1a,
    rows: [
      '............',
      '......#.....',
      '.....#.#....',
      '....#.=.#...',
      '.....#.#....',
      '......#.....',
      '............',
    ],
  },
  {
    id: 'diagonals',
    name: 'Diagonals',
    group: 'blocks',
    code: 0x11,
    rows: [
      '..#........#',
      '.#...#....#.',
      '....#....#..',
      '...#....#...',
      '..#....#....',
      '.#....#...#.',
      '#........#..',
    ],
  },
  {
    id: 'pillar-rows',
    name: 'Pillar rows',
    group: 'blocks',
    code: 0x0d,
    rows: [
      '............',
      '.#.#.##.#.#.',
      '............',
      '.#.#.##.#.#.',
      '............',
      '.#.#.##.#.#.',
      '............',
    ],
  },
  {
    id: 'columns',
    name: 'Columns',
    group: 'blocks',
    code: 0x10,
    rows: [
      '............',
      '.#.#.##.#.#.',
      '.#.#.##.#.#.',
      '.#.#.##.#.#.',
      '.#.#.##.#.#.',
      '.#.#.##.#.#.',
      '............',
    ],
  },
  {
    id: 'three-bars',
    name: 'Three bars',
    group: 'blocks',
    code: 0x07,
    rows: [
      '............',
      '.##########.',
      '............',
      '.##########.',
      '............',
      '.##########.',
      '............',
    ],
  },
  {
    id: 'vertical-chute',
    name: 'Vertical chute',
    group: 'blocks',
    code: 0x0e,
    rows: [
      '....#..#....',
      '....#..#....',
      '....#..#....',
      '....#..#....',
      '....#..#....',
      '....#..#....',
      '....#..#....',
    ],
  },
  {
    id: 'horizontal-chute',
    name: 'Horizontal chute',
    group: 'blocks',
    code: 0x0f,
    rows: [
      '............',
      '............',
      '############',
      '............',
      '############',
      '............',
      '............',
    ],
  },
  {
    id: 'block-ring',
    name: 'Block ring',
    group: 'blocks',
    code: 0x29,
    rows: [
      '............',
      '.##########.',
      '.#..o..o..#.',
      '.#.o....o.#.',
      '.#........#.',
      '.####..####.',
      '............',
    ],
  },
  {
    id: 'closed-ring',
    name: 'Closed ring',
    group: 'blocks',
    code: 0x09,
    rows: [
      '............',
      '..########..',
      '..#......#..',
      '..#......#..',
      '..#......#..',
      '..########..',
      '............',
    ],
  },
  {
    id: 'c-shape',
    name: 'C shape',
    group: 'blocks',
    code: 0x08,
    rows: [
      '............',
      '.##########.',
      '..........#.',
      '..........#.',
      '..........#.',
      '.##########.',
      '............',
    ],
  },
  {
    id: 'spiral',
    name: 'Spiral',
    group: 'blocks',
    code: 0x1c,
    rows: [
      '..........#.',
      '.########.#.',
      '.#.....=#.#.',
      '.#...####.#.',
      '.#........#.',
      '.##########.',
      '............',
    ],
  },
  {
    id: 'maze',
    name: 'Maze',
    group: 'blocks',
    code: 0x0c,
    rows: [
      '.#.#........',
      '.#.###.###..',
      '.#...#...###',
      '.#.#.#...#..',
      '.###.#...#..',
      '.....#.#.#.#',
      '..#....#...#',
    ],
  },
  {
    id: 'funnel',
    name: 'Funnel',
    group: 'blocks',
    code: 0x05,
    rows: [
      '#####..#####',
      '####....####',
      '##........##',
      '............',
      '............',
      '..#......#..',
      '............',
    ],
  },
  {
    id: 'wedge',
    name: 'Wedge',
    group: 'blocks',
    code: 0x1b,
    rows: [
      '........####',
      '........####',
      '.........###',
      '...........=',
      '.........###',
      '........####',
      '........####',
    ],
  },
  {
    id: 'small-wedge',
    name: 'Small wedge',
    group: 'blocks',
    code: 0x04,
    rows: [
      '.......#####',
      '.........###',
      '..........##',
      '............',
      '..........##',
      '.........###',
      '.......#####',
    ],
  },
  {
    id: 'cross-path',
    name: 'Cross path',
    group: 'blocks',
    code: 0x20,
    rows: [
      '#####..#####',
      '######.#####',
      '######.#####',
      '......#.....',
      '######.#####',
      '######.#####',
      '#####..#####',
    ],
  },
  {
    id: 'statue-grid',
    name: 'Statue grid',
    group: 'blocks',
    code: 0x21,
    rows: [
      '............',
      '.o..o..o..o.',
      '............',
      '.o..o..o..o.',
      '.....::.....',
      '.o.:o::o:.o.',
      '...::::::...',
    ],
  },
  {
    id: 'arch',
    name: 'Arch',
    group: 'blocks',
    code: 0x27,
    rows: [
      '############',
      '#...#xx#...#',
      '#.##xxxx##.#',
      '#.##xxxx##.#',
      '#...o..o...#',
      '#..........#',
      '#.o......o.#',
    ],
  },
  {
    id: 'moat',
    name: 'Moat',
    group: 'water',
    code: 0x14,
    rows: [
      '............',
      '.~~~~~~~~~~.',
      '.~........~.',
      '.~........~.',
      '.~........~.',
      '.~~~~~~~~~~.',
      '............',
    ],
  },
  {
    id: 'brackets',
    name: 'Brackets',
    group: 'water',
    code: 0x15,
    rows: [
      '............',
      '.~~~....~~~.',
      '.~........~.',
      '.~.~~~~~~.~.',
      '.~........~.',
      '.~~~....~~~.',
      '............',
    ],
  },
  {
    id: 'figure-eight',
    name: 'Figure eight',
    group: 'water',
    code: 0x16,
    rows: [
      '~~~~~..~~~~~',
      '~...~~~~...~',
      '~.~~~..~~~.~',
      '..~......~..',
      '~.~~~..~~~.~',
      '~...~~~~...~',
      '~~~~~..~~~~~',
    ],
  },
  {
    id: 'water-maze',
    name: 'Water maze',
    group: 'water',
    code: 0x17,
    rows: [
      '~~~~~..~~~~~',
      '~...~....~.~',
      '~.~.~.~~.~.~',
      '..~.~..~.~..',
      '~.~.~~.~.~.~',
      '~.~....~...~',
      '~~~~~..~~~~~',
    ],
  },
  {
    id: 'water-u',
    name: 'Water U',
    group: 'water',
    code: 0x12,
    rows: [
      '............',
      '.~~~~~~~~~~.',
      '.~~~~~~~~~~.',
      '.~~......~~.',
      '.~~......~~.',
      '.~~~~..~~~~.',
      '.~~~~..~~~~.',
    ],
  },
  {
    id: 'water-hook',
    name: 'Water hook',
    group: 'water',
    code: 0x0b,
    rows: [
      '.~~.........',
      '.~~~~~~~~~~.',
      '.~~~~~~~~~~.',
      '.~.......~~.',
      '.~~......~~.',
      '.~~......~~.',
      '.~~......~~.',
    ],
  },
  {
    id: 'water-line',
    name: 'Water line',
    group: 'water',
    code: 0x18,
    rows: [
      '............',
      '............',
      '~~~~~~~~~~~~',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  {
    id: 'two-water-lines',
    name: 'Two water lines',
    group: 'water',
    code: 0x19,
    rows: [
      '............',
      '~~~~~~~~~~~~',
      '............',
      '............',
      '............',
      '~~~~~~~~~~~~',
      '............',
    ],
  },
  {
    id: 'stream',
    name: 'Stream',
    group: 'water',
    code: 0x13,
    rows: [
      '........~...',
      '........~...',
      '........~...',
      '........~...',
      '........~...',
      '........~...',
      '........~...',
    ],
  },
  {
    id: 'sand',
    name: 'Sand',
    group: 'floor',
    code: 0x25,
    rows: [
      '::::::::::::',
      '::::::::::::',
      '::::::::::::',
      '::::::::::::',
      '::::::::::::',
      '::::::::::::',
      '::::::::::::',
    ],
  },
  {
    id: 'black-floor',
    name: 'Black floor',
    group: 'floor',
    code: 0x26,
    rows: [
      'xxxxxxxxxxxx',
      'xxxxxxxxxxxx',
      'xxxxxxxxxxxx',
      'xxxxxxxxxxxx',
      'xxxxxxxxxxxx',
      'xxxxxxxxxxxx',
      'xxxxxxxxxxxx',
    ],
  },
  {
    id: 'black-maze',
    name: 'Black maze',
    group: 'floor',
    code: 0x28,
    rows: [
      'oxx......xxo',
      'xx..x..x..xx',
      'xx.xx..xx.xx',
      'xx.xx..xx.xx',
      'xx...xx...xx',
      'xxxx....xxxx',
      'oxxx....xxxo',
    ],
  },
];

export const ROOM_LAYOUTS_BY_ID: ReadonlyMap<string, RoomLayoutDef> = new Map(
  ROOM_LAYOUTS.map((layout) => [layout.id, layout]),
);

/** A known layout id, or '' for a room whose layout has not been recorded. */
export function isRoomLayout(value: unknown): value is string {
  return value === '' || (typeof value === 'string' && ROOM_LAYOUTS_BY_ID.has(value));
}

/** The square row the game looks along for a push block: the middle one. */
const PUSH_BLOCK_ROW = 3;

/**
 * Whether a room on this layout can have a push block.
 *
 * The game does not store where a room's push block is. It takes the leftmost
 * block in the middle row (`FindAndCreatePushBlockObject` in Aldo Nunez's
 * disassembly, Z_05.asm) and matches the block tile only, so statues do not
 * count. A layout with no block in that row has nothing to push. This is the
 * game's rule, not a record of where the randomizer puts them: Spiral passes
 * it, and the original game uses it once, in the 2nd Quest.
 */
export function layoutCanPush(def: RoomLayoutDef): boolean {
  return def.rows[PUSH_BLOCK_ROW]?.includes('#') ?? false;
}

/** Whether the layout draws a staircase of its own: Diamond, Wedge, Spiral. */
export function layoutHasStairs(def: RoomLayoutDef): boolean {
  return def.rows.some((row) => row.includes('='));
}

/**
 * Whether a room on this layout can have stairs at all.
 *
 * A dungeon room's stairs are either part of its layout or revealed by
 * pushing its block (the "block → stairs" secret, which always puts them in
 * the same spot), so a room that can do neither never has any.
 */
export function layoutCanHaveStairs(def: RoomLayoutDef): boolean {
  return layoutHasStairs(def) || layoutCanPush(def);
}

/**
 * The layout a pre-layout save's chute mark stands for.
 *
 * Chute rooms were marked by direction before layouts existed, and both
 * directions are layouts of their own now, so nothing recorded is lost.
 */
export function layoutFromChute(chute: unknown): string {
  if (chute === 'vertical') return 'vertical-chute';
  if (chute === 'horizontal') return 'horizontal-chute';
  return '';
}
