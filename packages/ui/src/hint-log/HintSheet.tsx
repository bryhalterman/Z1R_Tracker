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
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [open, setOpen] = useState(false);
  const count = state.hints.length;

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
          <HintList state={state} interactive dispatch={store.dispatch} onShown={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
