module.exports = {
  preset: '@react-native/jest-preset',
  // *.harness.(ts|tsx) files use the react-native-harness preset (see
  // jest.harness.config.js / test:e2e*) and can't be parsed by this one —
  // they import from 'react-native-harness', an ESM-only package. e2eServer.ts
  // is a shared helper for those files, not a test suite itself.
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.harness\\.(ts|tsx)$',
    '/src/__tests__/e2eServer\\.ts$',
  ],
}
