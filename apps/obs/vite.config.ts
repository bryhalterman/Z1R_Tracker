import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { spriteManifest, workspaceAliases } from '../../vite.shared.mjs';

// Relative base: the built folder gets pointed at by a local file path or by
// whatever host the streamer parks it on, and neither is known at build time.
export default defineConfig({
  base: './',
  plugins: [spriteManifest()],
  resolve: { alias: workspaceAliases },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        // `index.html` is a setup page, not a tracker. The overlay has its own
        // name now: serving it at the root URL meant a dock pointed at `/` got
        // a read-only page with no explanation.
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        overlay: fileURLToPath(new URL('./overlay.html', import.meta.url)),
        dock: fileURLToPath(new URL('./dock.html', import.meta.url)),
      },
    },
  },
});
