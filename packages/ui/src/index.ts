// What the apps use: the panels are built by `mountTracker` and the header bar
// by `mountControls`, so the per-panel builders stay internal.
export { mountTracker, type MountOptions, type TrackerSection } from './tracker.js';
export { mountControls, type ControlsOptions } from './controls.js';
