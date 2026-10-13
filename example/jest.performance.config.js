module.exports = {
  ...require('./jest.harness.config'),
  testMatch: ['**/__tests__/**/*.performance.harness.tsx'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 300000,
};
