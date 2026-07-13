module.exports = {
  preset: 'react-native-harness',
  testMatch: ['**/__tests__/**/*.harness.(ts|tsx)'],
  // Device runs one test suite at a time.
  maxWorkers: 1,
}
