import { fileURLToPath } from 'node:url';

const source = (path) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Workspace packages are consumed as TypeScript source rather than built
 * artifacts, so every app aliases them to `src`. This keeps `npm run dev`
 * hot-reloading across package boundaries and removes a build ordering step.
 *
 * Order matters: Vite treats a string `find` as a prefix match, so the deep
 * `styles.css` entry has to come before the bare package name or it resolves
 * to `.../index.ts/styles.css`.
 */
export const workspaceAliases = [
  { find: '@z1r/ui/styles.css', replacement: source('./packages/ui/src/styles.css') },
  { find: '@z1r/ui', replacement: source('./packages/ui/src/index.ts') },
  { find: '@z1r/core', replacement: source('./packages/core/src/index.ts') },
];
