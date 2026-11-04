/**
 * The Levels heading's 1-9 picker: one joined strip, the same segmented
 * control the room card's Clear / Known / Visited uses.
 *
 * Three channels for the level you are looking at, so it is not told by color
 * alone: a filled tile, a heavier numeral and an underline. A level with
 * nothing recorded is drawn in the muted text color, and its label says so.
 *
 * Hovering or focusing a level points at its entrance on the overworld map.
 *
 * `z1r-room-level` and `data-touched` stay on each tile as hooks for custom
 * CSS; the look itself is all utilities here.
 */

import { ToggleGroup, ToggleGroupItem } from '#components/ui/toggle-group';
import { previewHandlers } from '../map-preview.js';

export interface LevelStripProps {
  /** Each level, and whether any room on it is recorded. */
  levels: readonly { value: number; touched: boolean }[];
  /** The level showing. */
  level: number;
  disabled?: boolean;
  onPick: (level: number) => void;
}

export function LevelStrip({ levels, level, disabled, onPick }: LevelStripProps) {
  return (
    <ToggleGroup
      aria-label="Level"
      variant="outline"
      size="sm"
      spacing={0}
      disabled={disabled}
      className="z1r-ui ml-3 tracking-normal normal-case"
      value={[String(level)]}
      // Pressing the level already showing would empty the group; there is
      // always a level showing, so that click is a no-op.
      onValueChange={(next) => {
        const picked = Number(next[0]);
        if (picked) onPick(picked);
      }}
    >
      {levels.map(({ value, touched }) => (
        <ToggleGroupItem
          key={value}
          value={String(value)}
          title={`Level ${value}`}
          aria-label={`Level ${value} — ${touched ? 'rooms recorded' : 'nothing recorded'}`}
          data-touched={String(touched)}
          className={
            'z1r-room-level min-w-7 cursor-pointer px-0 text-sm tabular-nums ' +
            'data-[touched=false]:text-muted-foreground ' +
            'data-[pressed]:bg-primary data-[pressed]:font-bold data-[pressed]:text-primary-foreground ' +
            'data-[pressed]:underline data-[pressed]:underline-offset-4 ' +
            'data-[pressed]:hover:bg-primary data-[pressed]:hover:text-primary-foreground'
          }
          {...previewHandlers({ kind: 'dungeon', level: value })}
        >
          {value}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
