/**
 * The hint log as a sheet that rises from the bottom, opened from the toolbar.
 *
 * The page is left undimmed and usable behind it, and the sheet stays open
 * while you work the page — only the × , Esc, the toolbar button or a Show
 * closes it. Show closes it because the region it lights up is on the
 * overworld map, which sits in the lower half of the page the sheet covers.
 */

import { useState, useSyncExternalStore } from 'react';
import type { Store } from '@z1r/core';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '#components/ui/sheet';
import { buttonVariants } from '#components/ui/button';
import { cn } from '#lib/utils';
import { HintList } from './HintList.js';

export function HintSheet({ store }: { store: Store }) {
  // Only the count: the header button is all that shows while the sheet is
  // closed, and it should not re-render for every edit elsewhere in the run.
  const count = useSyncExternalStore(store.subscribe, () => store.getState().hints.length);
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen} modal={false} disablePointerDismissal>
      <SheetTrigger
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'z1r-ui gap-1.5')}
        title="Hints you have heard"
      >
        Hints
        {count ? <span className="tabular-nums text-muted-foreground">{count}</span> : null}
      </SheetTrigger>
      <SheetContent side="bottom" showOverlay={false} className="z1r-ui max-h-[60vh] overflow-y-auto">
        <SheetHeader className="pb-0">
          <SheetTitle>Hints{count ? ` · ${count}` : ''}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <HintSheetBody store={store} onShown={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The log itself, which reads the whole state, rendered only inside the open sheet. */
function HintSheetBody({ store, onShown }: { store: Store; onShown: () => void }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return <HintList state={state} interactive dispatch={store.dispatch} onShown={onShown} />;
}
