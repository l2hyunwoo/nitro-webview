const rnFlat = require('@react-native/eslint-config/flat')
const prettierPlugin = require('eslint-plugin-prettier')

module.exports = [
  ...rnFlat,
  {
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': [
        'warn',
        {
          quoteProps: 'consistent',
          singleQuote: true,
          tabWidth: 2,
          trailingComma: 'es5',
          useTabs: false,
          semi: false,
        },
      ],
    },
  },
  {
    // Type-level test files use `void` expressions to assert assignability.
    files: ['src/**/*.type-test.ts'],
    rules: { 'no-void': 'off' },
  },
  {
    ignores: [
      'node_modules/',
      'lib/',
      'nitrogen/',
      'example/',
      '.yarn/',
      // Gradle test reports drop HTML+JS artifacts under android/build/.
      'android/build/',
      'babel.config.js',
      'react-native.config.js',
      'eslint.config.js',
    ],
  },
]
