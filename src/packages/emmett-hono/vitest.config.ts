import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Configure Vitest for this specific package
    name: 'emmett-hono',
    environment: 'miniflare',
    // Look for spec files within the src directory of this package
    include: ['./src/**/*.spec.ts'],
    // Exclude standard directories
    exclude: ['./**/node_modules/**', './**/dist/**'],
    // Optional: If you need setup files specific to this package
    // setupFiles: ['./src/testing/setup.ts'],

    // Moved Coverage configuration inside 'test' object
    coverage: {
      provider: 'v8', // Requires installing @vitest/coverage-v8
      reporter: ['text', 'html'],
      // Thresholds (adjust as needed)
      thresholds: {
        lines: 85,
        branches: 90,
        functions: 80,
        statements: 85,
        // Check thresholds per file
        perFile: true,
      },
      // Include only files in src, exclude index and types for now
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/types.ts', // Often high branch complexity, low logic
        'src/**/*.spec.ts', // Exclude test files themselves
        'src/testing/**', // Exclude testing utilities
      ],
    },
  },
});
