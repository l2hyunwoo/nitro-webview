// Separate from jest.config.js so `yarn test` (App.test.tsx and other host
// tests) keeps running on the standard RN preset. Only test:e2e* uses this.
module.exports = {
  preset: 'react-native-harness',
  testMatch: ['**/__tests__/**/*.harness.(ts|tsx)'],
  // Device runs one test suite at a time.
  maxWorkers: 1,
}
