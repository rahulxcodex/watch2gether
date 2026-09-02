import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    alias: {
      '@watch2gether/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
    },
    server: {
      deps: {
        external: ['node:sqlite', 'sqlite'],
      },
    },
    testTimeout: 10000,
  },
});