const { defineConfig, globalIgnores } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expo,
  prettier,
  globalIgnores(['dist/*', '.expo/*']),
]);
