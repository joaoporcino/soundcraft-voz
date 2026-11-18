import js from '@eslint/js';

export default [
  {
    ignores: ['**/node_modules/**', '.venv/**', '**/__pycache__/**', '**/*.py'],
  },
  {
    files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.js', 'fixtures/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...js.configs.recommended.languageOptions?.globals,
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortController: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    files: ['src/panel/**/*.js'],
    languageOptions: { globals: { document: 'readonly', location: 'readonly', history: 'readonly',
      URLSearchParams: 'readonly', fetch: 'readonly', Option: 'readonly' } },
  },
];
