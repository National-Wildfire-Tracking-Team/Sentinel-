import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './Tests/Vitest/setup.js',
    include: ['Tests/Vitest/**/*.{test,spec}.{js,jsx}'],
    css: false,
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/main.jsx',
        'src/index.css',
        'src/app/data/**',
        '**/*.test.*',
        '**/*.spec.*',
      ],
      thresholds: {
        statements: 8,
        branches: 5,
        functions: 8,
        lines: 8,
      },
    },
  },
});
