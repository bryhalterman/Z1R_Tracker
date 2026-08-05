/**
 * Overworld hint regions.
 *
 * Z1R hints name a *region*, not a screen — "Digdogger gazes… By a Lake". So
 * the useful thing to put on a tracker map is which region each screen belongs
 * to, letting a hint narrow 128 screens down to a handful.
 *
 * The table below was extracted from the community hint map by matching each
 * screen against the map's flat fill colours; every screen resolved at ≥92%
 * agreement. Source:
 * https://z1r.fandom.com/wiki/Maps → OW_Hint_Locations.png
 */

export interface RegionDef {
  readonly id: string;
  readonly name: string;
  /** Two-letter code drawn on the map. The non-colour channel — see ARCHITECTURE.md. */
  readonly code: string;
  /** Tint used to reinforce the code, never to replace it. */
  readonly color: string;
}

export const REGIONS: readonly RegionDef[] = [
  { id: 'deathMountain', name: 'Death Mountain', code: 'DM', color: '#a349a4' },
  { id: 'grave', name: 'At the Grave', code: 'GR', color: '#7092be' },
  { id: 'deadWoods', name: 'The Dead Woods', code: 'DW', color: '#ff7f27' },
  { id: 'river', name: 'The River', code: 'RV', color: '#ed1c24' },
  { id: 'closeToStart', name: 'Close to Start', code: 'CS', color: '#800000' },
  { id: 'lake', name: 'By a Lake', code: 'LK', color: '#22b14c' },
  { id: 'coast', name: 'The Coast', code: 'CO', color: '#c0c0c0' },
  { id: 'forest', name: 'The Forest', code: 'FO', color: '#b97a57' },
  { id: 'lostHills', name: 'The Lost Hills', code: 'LH', color: '#800040' },
  { id: 'desert', name: 'The Desert', code: 'DE', color: '#fff200' },
];

export const REGIONS_BY_ID: ReadonlyMap<string, RegionDef> = new Map(
  REGIONS.map((region) => [region.id, region]),
);

const BY_CODE: ReadonlyMap<string, RegionDef> = new Map(REGIONS.map((r) => [r.code, r]));

/** Rows A-H, each 16 screen codes left to right. */
const REGION_ROWS: readonly string[] = [
  'DM DM DM DM DM DM DM DM DM DM LK LH LH LH CO CO',
  'DM DM DM DM DM DM DM RV RV RV RV LH LH LH CO CO',
  'GR GR GR GR GR GR LK RV DE DE DE DE DE CO CO CO',
  'GR GR GR GR LK LK LK LK LK LK DE DE FO FO CO CO',
  'GR GR LK LK LK LK LK LK LK DE DE DE FO FO FO CO',
  'GR DW DW DW LK LK LK CS CS LK LK FO FO FO FO CO',
  'GR DW DW DW DW RV CS CS CS LK LK FO FO FO FO CO',
  'DW DW DW DW DW RV CS CS CS CS CS CO CO CO CO CO',
];

const ROW_LABELS = 'ABCDEFGH';

function buildScreenRegions(): Map<string, string> {
  const map = new Map<string, string>();
  REGION_ROWS.forEach((row, rowIndex) => {
    row.split(' ').forEach((code, colIndex) => {
      const region = BY_CODE.get(code);
      if (region) map.set(`${ROW_LABELS[rowIndex]}${colIndex + 1}`, region.id);
    });
  });
  return map;
}

/** Screen id ("H8") -> region id. */
export const SCREEN_REGIONS: ReadonlyMap<string, string> = buildScreenRegions();

/**
 * Horizontal mirror of a screen id: A1 <-> A16.
 *
 * The Mirrored Overworld flag flips the whole map, so the terrain — and with
 * it the hint region — at A1 becomes whatever used to be at A16. There is no
 * separate mirrored hint map for that reason; the same table reflects.
 */
export function mirrorScreen(screen: string): string {
  const row = screen.slice(0, 1);
  const col = Number(screen.slice(1));
  if (!Number.isFinite(col) || col < 1 || col > 16) return screen;
  return `${row}${17 - col}`;
}

export function regionForScreen(screen: string, mirrored = false): RegionDef | undefined {
  const id = SCREEN_REGIONS.get(mirrored ? mirrorScreen(screen) : screen);
  return id ? REGIONS_BY_ID.get(id) : undefined;
}

/** Every screen in a region, in reading order. Used to highlight a hint. */
export function screensInRegion(regionId: string, mirrored = false): string[] {
  const screens: string[] = [];
  for (const [screen, id] of SCREEN_REGIONS) {
    if (id === regionId) screens.push(mirrored ? mirrorScreen(screen) : screen);
  }
  return screens.sort();
}
