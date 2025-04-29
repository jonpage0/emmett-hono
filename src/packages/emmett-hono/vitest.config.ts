import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Configure Vitest for this specific package
    name: 'emmett-hono',
    environment: 'node',
    // Look for spec files within the src directory of this package
    include: ['./src/**/*.spec.ts'],
    // Exclude standard directories
    exclude: ['./**/node_modules/**', './**/dist/**'],
    // Optional: If you need setup files specific to this package
    // setupFiles: ['./src/testing/setup.ts'],
  },
});
