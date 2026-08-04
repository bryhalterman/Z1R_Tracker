import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { workspaceAliases } from '../../vite.shared.mjs';

// Relative base: the built folder gets pointed at by a local file path or by
// whatever host the streamer parks it on, and neither is known at build time.
export default defineConfig({
  base: './',
  resolve: { alias: workspaceAliases },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        overlay: fileURLToPath(new URL('./index.html', import.meta.url)),
        dock: fileURLToPath(new URL('./dock.html', import.meta.url)),
      },
    },
  },
});
