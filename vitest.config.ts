import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'claude-task-runner': path.resolve(__dirname, 'node_modules/claude-task-runner/dist/index.js'),
    },
  },
});
