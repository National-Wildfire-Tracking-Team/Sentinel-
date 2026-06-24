import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/main.jsx',
        'src/index.css',
        'src/data/**',
        'src/test/**',
        '**/*.test.*',
        '**/*.spec.*',
      ],
      thresholds: {
        statements: 10,
        branches: 5,
        functions: 10,
        lines: 10,
      },
    },
  },
});
