import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;

export default defineConfig([
  // Config for NPM package (dual CJS/ESM)
  {
    format: ['esm', 'cjs'],
    splitting: true,
    clean: true,
    dts: true,
    minify: true, //env === 'production',
    bundle: true, //env === 'production',
    skipNodeModulesBundle: true,
    external: ['@event-driven-io/emmett-postgresql', 'pg'], // Mark pgsql and pg as external
    watch: env === 'development',
    target: 'es2022',
    outDir: 'dist',
    entry: ['src/index.ts'],
    sourcemap: true,
    tsconfig: 'tsconfig.build.json', // workaround for https://github.com/egoist/tsup/issues/571#issuecomment-1760052931
  },
]);
