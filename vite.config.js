import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { resolve } from 'path';
import { standaloneContent } from './build/standalone-content.mjs';

export default defineConfig({
  plugins: [crx({ manifest }), standaloneContent(manifest)],
  build: {
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'src/dashboard.html'),
      },
    },
  },
});