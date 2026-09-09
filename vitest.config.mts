import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Runs ONLY the pure domain layer (no React Native imports allowed there).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
      thresholds: { lines: 90 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
