import { defineConfig } from 'vite';
import { workspaceAliases } from '../../vite.shared.mjs';

// GitHub Pages serves this repo from /Z1R_Tracker/. `PAGES_BASE=/` lets a
// custom domain (or a local preview) build against the root instead.
const base = process.env.PAGES_BASE ?? '/Z1R_Tracker/';

export default defineConfig({
  base,
  resolve: { alias: workspaceAliases },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
