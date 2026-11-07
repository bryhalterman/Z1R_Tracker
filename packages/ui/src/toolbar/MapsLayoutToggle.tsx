/**
 * Overworld and Levels side by side, stacked, or chosen by width — a joined
 * strip in the toolbar, drawn like the Levels strip so the pressed choice reads
 * by its fill, its weight and an underline rather than by hue.
 */

import { useSyncExternalStore } from 'react';
import { ToggleGroup, ToggleGroupItem } from '#components/ui/toggle-group';
import { mapsLayout, type MapsLayout } from '../maps-layout.js';

const CHOICES: readonly { value: MapsLayout; label: string; title: string }[] = [
  {
    value: 'auto',
    label: 'Auto',
    title: 'Side by side when the window is wide enough, stacked when it is not',
  },
  { value: 'side', label: 'Side by side', title: 'Overworld and Levels side by side at every width' },
  { value: 'stacked', label: 'Stacked', title: 'Overworld above Levels at every width' },
];

export function MapsLayoutToggle() {
  const value = useSyncExternalStore(mapsLayout.watch, mapsLayout.get);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Maps</span>
      <ToggleGroup
        aria-label="Map layout"
        variant="outline"
        size="sm"
        spacing={0}
        value={[value]}
        // Pressing the choice already made would empty the group; there is
        // always a layout, so that click is a no-op.
        onValueChange={(next) => {
          const picked = next[0] as MapsLayout | undefined;
          if (picked) mapsLayout.set(picked);
        }}
      >
        {CHOICES.map((choice) => (
          <ToggleGroupItem
            key={choice.value}
            value={choice.value}
            title={choice.title}
            className={
              'cursor-pointer px-2 text-xs ' +
              'data-[pressed]:bg-primary data-[pressed]:font-bold data-[pressed]:text-primary-foreground ' +
              'data-[pressed]:underline data-[pressed]:underline-offset-4 ' +
              'data-[pressed]:hover:bg-primary data-[pressed]:hover:text-primary-foreground'
            }
          >
            {choice.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
