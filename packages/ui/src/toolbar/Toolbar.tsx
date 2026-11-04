/**
 * The toolbar, in React with shadcn/ui: the seed settings, the hint log, and
 * save file export, import and reset.
 *
 * Import and Reset each throw the current run away, so each asks first — in an
 * alert dialog drawn like the rest of the tracker rather than the browser's own
 * confirm box. Import asks only when there is a run to lose.
 */

import { useEffect, useRef, useState } from 'react';
import { exportState, importState, type Store, type TrackerState } from '@z1r/core';
import { Button } from '#components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { SeedSheet } from '../seed-form/SeedSheet.js';
import { HintSheet } from '../hint-log/HintSheet.js';

export interface ToolbarProps {
  store: Store;
  /** Shown at the far end of the bar; the OBS dock uses it for its build id. */
  footnote?: string;
}

/** A yes-or-no question about losing the current run. */
function ConfirmLoss({
  open,
  title,
  description,
  confirm,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent className="z1r-ui">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm}>
            {confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Toolbar({ store, footnote }: ToolbarProps) {
  const filePicker = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [pendingImport, setPendingImport] = useState<TrackerState | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Clear a message after a beat, so a stale error doesn't sit on screen all run.
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(''), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const exportRun = () => {
    const blob = new Blob([exportState(store.getState())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `z1r-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const load = (state: TrackerState) => {
    store.dispatch({ type: 'import', state });
    setStatus('Save loaded.');
  };

  const readFile = async (file: File) => {
    try {
      const loaded = importState(await file.text());
      // Import discards the current run exactly as Reset does, so it asks the
      // same question once there is something to lose.
      if (store.getState().rev > 0) setPendingImport(loaded);
      else load(loaded);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not read that file.');
    }
  };

  return (
    <div className="z1r-ui flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <SeedSheet store={store} />
      <HintSheet store={store} />
      <Button variant="outline" size="sm" onClick={exportRun} title="Download this run as a save file">
        Export
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => filePicker.current?.click()}
        title="Load a save file, replacing this run"
      >
        Import
      </Button>
      <input
        ref={filePicker}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared at once, so picking the same file again still fires.
          event.target.value = '';
          if (file) void readFile(file);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="hover:border-destructive hover:text-destructive"
        onClick={() => setConfirmReset(true)}
        title="Clear the current run"
      >
        Reset
      </Button>
      {status ? (
        <span className="text-xs text-primary" role="status">
          {status}
        </span>
      ) : null}
      {footnote ? <span className="ml-auto text-xs text-muted-foreground">{footnote}</span> : null}

      <ConfirmLoss
        open={pendingImport !== null}
        title="Load this save?"
        description="The current run is replaced."
        confirm="Load save"
        onCancel={() => setPendingImport(null)}
        onConfirm={() => {
          if (pendingImport) load(pendingImport);
          setPendingImport(null);
        }}
      />
      <ConfirmLoss
        open={confirmReset}
        title="Reset the tracker?"
        description="This clears the current run."
        confirm="Reset"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          store.dispatch({ type: 'reset' });
          setConfirmReset(false);
          setStatus('Tracker reset.');
        }}
      />
    </div>
  );
}
