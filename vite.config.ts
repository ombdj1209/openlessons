import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths: the same build works at a domain root or under /openlessons/ on GitHub Pages.
  base: './',
  plugins: [react()],
  // The main chunk is mostly lesson JSON (bundled so the library works offline); ~200 kB gzipped.
  build: { chunkSizeWarningLimit: 1600 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
