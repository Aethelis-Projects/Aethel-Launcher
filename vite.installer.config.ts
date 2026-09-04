import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve('crates/aethel-installer/src-ui'),
  base: './',
  build: {
    outDir: path.resolve('crates/aethel-installer/dist'),
    emptyOutDir: true,
  },
});
