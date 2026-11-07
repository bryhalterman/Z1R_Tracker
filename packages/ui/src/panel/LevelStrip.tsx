/**
 * The Levels heading's 1-9 picker: one joined strip, the same segmented
 * control the room card's Clear / Known / Visited uses.
 *
 * Three channels for the level you are looking at, so it is not told by color
 * alone: a filled tile, a heavier numeral and an underline.
 *
 * Every other level shows how far along it is (`levelProgress`): not found is
 * a thin, muted numeral; found is bold and bright; complete is bold and gold.
 * Found and complete differ by color only — the owner's choice — so the hover
 * title and the accessible label both say which, for anyone who cannot tell
 * them apart.
 *
 * Hovering or focusing a level points at its entrance on the overworld map.
 *
 * `z1r-room-level` and `data-progress` stay on each tile as hooks for custom
 * CSS; the look itself is all utilities here.
 */

import type { LevelProgress } from '@z1r/core';
import { ToggleGroup, ToggleGroupItem } from '#components/ui/toggle-group';
import { previewHandlers } from '../map-preview.js';

export interface LevelStripProps {
  /** Each level, and how far along it is. */
  levels: readonly { value: number; progress: LevelProgress }[];
  /** The level showing. */
  level: number;
  onPick: (level: number) => void;
}

const PROGRESS_TEXT: Record<LevelProgress, string> = {
  notFound: 'not found on the map',
  found: 'found',
  complete: 'complete',
};

export function LevelStrip({ levels, level, onPick }: LevelStripProps) {
  return (
    <ToggleGroup
      aria-label="Level"
      variant="outline"
      size="sm"
      spacing={0}
      className="z1r-ui ml-3 tracking-normal normal-case"
      value={[String(level)]}
      // Pressing the level already showing would empty the group; there is
      // always a level showing, so that click is a no-op.
      onValueChange={(next) => {
        const picked = Number(next[0]);
        if (picked) onPick(picked);
      }}
    >
      {levels.map(({ value, progress }) => (
        <ToggleGroupItem
          key={value}
          value={String(value)}
          // The same words as the label, so found and complete can be told
          // apart on hover without relying on the gold.
          title={`Level ${value} — ${PROGRESS_TEXT[progress]}`}
          aria-label={`Level ${value} — ${PROGRESS_TEXT[progress]}`}
          data-progress={progress}
          className={
            'z1r-room-level min-w-7 cursor-pointer px-0 text-sm tabular-nums ' +
            // Only while not pressed: the level showing keeps its own fill and
            // ink, which a gold numeral would vanish into.
            'not-data-[pressed]:data-[progress=notFound]:font-light ' +
            'not-data-[pressed]:data-[progress=notFound]:text-muted-foreground ' +
            'not-data-[pressed]:data-[progress=found]:font-bold ' +
            'not-data-[pressed]:data-[progress=found]:text-foreground ' +
            'not-data-[pressed]:data-[progress=complete]:font-bold ' +
            'not-data-[pressed]:data-[progress=complete]:text-primary ' +
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
