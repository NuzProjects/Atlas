export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'artifacts/**', 'src/vendor/**', 'assets/**', 'public/atlas-url-crypto.js'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'valid-typeof': 'error',
      'no-unsafe-finally': 'error',
      'constructor-super': 'error',
      'no-async-promise-executor': 'error',
    },
  },
];
