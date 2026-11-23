const { defineConfig, globalIgnores } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expo,
  prettier,
  globalIgnores(['dist/*', '.expo/*', 'worker/*', 'src/lib/api/generated/*']),
  // jest.mock must precede the imports it affects, and mocks use require().
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: { 'import/first': 'off', '@typescript-eslint/no-require-imports': 'off' },
  },
  // RHF watch() only opts the component out of React Compiler memoization; no stale-UI risk here.
  { rules: { 'react-hooks/incompatible-library': 'off' } },
]);
