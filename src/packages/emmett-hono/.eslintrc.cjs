module.exports = {
  root: true, // Prevent ESLint from looking for configs in parent directories
  extends: ['../../../../.eslintrc.base.cjs'], // Extend from the workspace root config if it exists (adjust path as needed)
  ignorePatterns: ['*.js', '*.cjs', '*.json'],
  overrides: [
    {
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json'],
      },
    },
    {
      files: ['.eslintrc.cjs'],
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@event-driven-io/emmett-hono',
            importNames: ['Legacy'],
            message:
              'The Legacy shim is deprecated. Use direct Hono helpers (e.g., sendCreated, sendProblem) or c.json/c.text in new code.',
          },
        ],
        patterns: [], // No patterns needed here
      },
    ],
  },
};
