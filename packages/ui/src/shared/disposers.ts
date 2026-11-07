/**
 * Cleanups registered while a mount is being built.
 *
 * `mountTracker` builds its panels inside `collectDisposers`, and anything
 * created while it does — each panel's React root, a listener on the document
 * — registers its own cleanup with `onDispose`. The tracker's teardown runs
 * them all without each builder having to hand one back.
 *
 * Kept free of React and the DOM so it can be tested on its own.
 */

let collecting: (() => void)[] | null = null;

/**
 * Run `build`, returning what it built and every cleanup registered with
 * `onDispose` while it ran. Synchronous only: something created later, in a
 * render pass, is not collected. Nested calls each keep their own list, and a
 * throw from `build` still restores the outer one.
 */
export function collectDisposers<T>(build: () => T): { built: T; disposers: (() => void)[] } {
  const outer = collecting;
  const disposers: (() => void)[] = [];
  collecting = disposers;
  try {
    return { built: build(), disposers };
  } finally {
    collecting = outer;
  }
}

/** Register a cleanup with the mount being built. Outside a build, a no-op. */
export function onDispose(dispose: () => void): void {
  collecting?.push(dispose);
}
