// src/ui/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname; // = src/ui

export default defineConfig({
  root,
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true
  }
});
