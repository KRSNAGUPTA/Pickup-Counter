import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30000,
    setupFiles: ['./test/setup.ts'],
  },
});