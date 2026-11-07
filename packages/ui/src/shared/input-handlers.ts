/**
 * Event handlers the tiles and cells share: a right click that acts instead of
 * opening the browser's menu, and arrow keys that step a value.
 *
 * Kept free of the DOM, beyond the event's shape, so they can be tested on
 * their own.
 */

/** The part of a mouse or keyboard event these handlers use. */
interface Cancelable {
  preventDefault(): void;
}

/** A right click that runs `action` in place of the browser's menu. */
export function onRightClick(action: () => void) {
  return (event: Cancelable) => {
    event.preventDefault();
    action();
  };
}

/** Which way each key steps; a key not listed is left to the browser. */
export type StepKeys = Readonly<Record<string, 1 | -1>>;

/** The direction `key` steps, or undefined for a key not listed. */
export function stepFor(keys: StepKeys, key: string): 1 | -1 | undefined {
  return Object.prototype.hasOwnProperty.call(keys, key) ? keys[key] : undefined;
}

/** A keydown handler that steps on the listed keys and takes them from the browser. */
export function onStepKeys(keys: StepKeys, step: (direction: 1 | -1) => void) {
  return (event: Cancelable & { key: string }) => {
    const direction = stepFor(keys, event.key);
    if (direction === undefined) return;
    event.preventDefault();
    step(direction);
  };
}
