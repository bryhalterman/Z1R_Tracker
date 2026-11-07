/**
 * A text field's value while it is being typed into.
 *
 * Each dispatch saves the run and broadcasts it to the other windows, so a
 * field that dispatched on every keystroke sent a price or a note across a
 * character at a time. The draft holds what is typed and commits it once
 * typing pauses, when the field loses focus, and — so nothing typed is lost —
 * when it unmounts with an edit still pending.
 *
 * While the field is not being edited, the draft follows the stored value, so
 * an edit made in another window still shows.
 */

import { useEffect, useRef, useState } from 'react';

/** How long typing has to pause before the draft is committed. */
const PAUSE_MS = 300;

export function useDraft(stored: string, commit: (value: string) => void) {
  const [draft, setDraft] = useState(stored);
  const [editing, setEditing] = useState(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest commit, so a timer or the unmount never calls a stale one.
  const latest = useRef(commit);
  latest.current = commit;

  if (!editing && draft !== stored) setDraft(stored);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current === null) return;
    const value = pending.current;
    pending.current = null;
    latest.current(value);
  };

  useEffect(() => flush, []);

  return {
    value: draft,
    onChange: (value: string) => {
      setDraft(value);
      setEditing(true);
      pending.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, PAUSE_MS);
    },
    onBlur: () => {
      flush();
      setEditing(false);
    },
  };
}
