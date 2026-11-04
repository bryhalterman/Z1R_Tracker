/**
 * The seed settings as a sheet that slides in from the right, opened from the
 * toolbar.
 *
 * The settings are entered once before a run and read rarely after, so they
 * no longer hold a panel on the page.
 *
 * Mounted beside the toolbar rather than inside `mountTracker`, so it reads
 * the store itself instead of being handed state by a patch loop.
 */

import { useSyncExternalStore } from 'react';
import type { SeedSettings, Store } from '@z1r/core';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#components/ui/sheet';
import { buttonVariants } from '#components/ui/button';
import { cn } from '#lib/utils';
import { SeedForm } from './SeedForm.js';

export function SeedSheet({ store }: { store: Store }) {
  const seed = useSyncExternalStore(store.subscribe, () => store.getState().seed);
  const set = (patch: Partial<SeedSettings>) => store.dispatch({ type: 'setSeed', patch });
  return (
    <Sheet>
      <SheetTrigger className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'z1r-ui')} title="Seed settings">
        Seed
      </SheetTrigger>
      <SheetContent side="right" className="z1r-ui w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Seed settings</SheetTitle>
          <SheetDescription>Set these before the run. They decide each level’s item slots and the map.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <SeedForm seed={seed} interactive set={set} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
