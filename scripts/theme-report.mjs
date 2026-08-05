#!/usr/bin/env node
/*
 * Contrast report for the tracker's semantic colour aliases.
 *
 * The tracker's palette is Spectrum's — `packages/ui/src/theme.css` binds each
 * `--z1r-*` alias to a Spectrum token rather than to a hand-picked hex. This
 * script resolves those bindings through Spectrum's own token CSS and checks
 * every foreground/background pair we actually render against WCAG AA.
 *
 * It exists because the one accessibility bug that shipped came from choosing
 * colours by eye. Run it after touching the theme:
 *
 *   npm run theme:check
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const TOKENS_DIR = fileURLToPath(
  new URL('../node_modules/@spectrum-css/tokens/dist/css/', import.meta.url),
);
const THEME = fileURLToPath(new URL('../packages/ui/src/theme.css', import.meta.url));

/** Parse `--name: value;` declarations out of a CSS file. */
async function readVars(file) {
  const text = await readFile(new URL(file, `file://${TOKENS_DIR}`), 'utf8');
  const vars = new Map();
  for (const [, name, value] of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(name, value.trim());
  }
  return vars;
}

/**
 * Expand every `var()` in a value until a literal falls out.
 *
 * Substitution has to be textual rather than whole-value: Spectrum stores
 * colours as `rgba(var(--spectrum-gray-50-rgb))`, so the reference sits inside
 * a function call and a "does this value start with var(" check misses it.
 */
function resolve(name, vars, depth = 0) {
  let value = vars.get(name);
  if (value === undefined) return null;
  while (value.includes('var(') && depth < 20) {
    const before = value;
    value = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (whole, ref, fallback) => {
      const inner = vars.get(ref);
      return inner !== undefined ? inner : (fallback ?? whole);
    });
    if (value === before) break; // unresolvable reference; stop rather than spin
    depth++;
  }
  return value.trim();
}

function toRgb(value) {
  if (!value) return null;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) return parts.slice(0, 3);
  }
  return null;
}

const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const globalVars = await readVars('global-vars.css');
const darkVars = await readVars('dark-vars.css');
const mediumVars = await readVars('medium-vars.css');
const spectrum = new Map([...globalVars, ...mediumVars, ...darkVars]);

// The alias -> Spectrum token bindings, read from theme.css so the report can
// never drift from what actually ships.
const themeCss = await readFile(THEME, 'utf8');
const aliases = new Map();
for (const [, name, value] of themeCss.matchAll(/(--z1r-[\w-]+)\s*:\s*([^;]+);/g)) {
  const ref = value.trim().match(/^var\(\s*(--[\w-]+)/);
  aliases.set(name, ref ? (resolve(ref[1], spectrum) ?? value.trim()) : value.trim());
}

/** Foreground / background pairs the tracker actually renders. */
const PAIRS = [
  ['--z1r-text', '--z1r-panel', 'body text on a panel'],
  ['--z1r-text', '--z1r-bg', 'body text on the page'],
  ['--z1r-muted', '--z1r-panel', 'labels and secondary text'],
  ['--z1r-muted', '--z1r-bg', 'secondary text on the page'],
  ['--z1r-accent', '--z1r-panel', 'accent text and counts'],
  ['--z1r-good', '--z1r-panel', 'met capability chips'],
  ['--z1r-bad', '--z1r-panel', 'destructive actions'],
  ['--z1r-text', '--z1r-field', 'input and option text'],
  ['--z1r-muted', '--z1r-field', 'placeholder text'],
];

let failures = 0;
console.log('Spectrum-derived palette — WCAG AA needs 4.5:1 for body text\n');
for (const [fg, bg, label] of PAIRS) {
  const fgRgb = toRgb(aliases.get(fg));
  const bgRgb = toRgb(aliases.get(bg));
  if (!fgRgb || !bgRgb) {
    console.log(`  ?      ${label} — could not resolve ${!fgRgb ? fg : bg}`);
    failures++;
    continue;
  }
  const ratio = contrast(fgRgb, bgRgb);
  const ok = ratio >= 4.5;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)}:1  ${label}` +
      `  (${fg} on ${bg})`,
  );
}

console.log(
  `\n${PAIRS.length - failures}/${PAIRS.length} pairs meet AA.` +
    (failures ? ' Adjust the token bindings in packages/ui/src/theme.css.' : ''),
);
process.exit(failures ? 1 : 0);
