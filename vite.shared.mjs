import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (path) => fileURLToPath(new URL(path, import.meta.url));

const MANIFEST = source('./packages/core/src/sprites/manifest.json');

/**
 * Publishes the sprite manifest next to each build's `index.html`.
 *
 * Every app fetches `sprites.json` before falling back to the copy compiled
 * into its bundle, which lets art be re-skinned by editing one deployed file.
 * Emitting it here rather than committing a copy per app keeps a single source
 * of truth, and stops the fetch from 404-ing on every page load — a console
 * error that looks like a fault but isn't.
 */
export function spriteManifest() {
  return {
    name: 'z1r-sprite-manifest',
    configureServer(server) {
      server.middlewares.use('/sprites.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        // Read per request so manifest edits show up without a restart.
        res.end(readFileSync(MANIFEST, 'utf8'));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sprites.json',
        source: readFileSync(MANIFEST, 'utf8'),
      });
    },
  };
}

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
