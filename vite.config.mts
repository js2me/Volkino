import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { mockAppPlugin } from './dev/vite-plugin.mjs';

export default defineConfig(({ command }) => ({
  publicDir: false,
  plugins: [solid({ solid: { delegateEvents: false } }), mockAppPlugin()],
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    outDir: 'app',
    emptyOutDir: false,
    target: 'chrome68',
    cssTarget: 'chrome68',
    lib: {
      entry: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
      name: 'VolKinoCatalog',
      formats: ['iife'],
      fileName: () => 'catalog.js',
      cssFileName: 'catalog',
    },
  },
  define: { 'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development') },
}));
