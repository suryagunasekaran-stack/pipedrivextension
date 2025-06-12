export default {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/basic-deals.test.js', '<rootDir>/tests/products-deals.test.js'],
  testTimeout: 30000, // 30 seconds per test
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testEnvironmentOptions: {
    experimental: {
      customExportConditions: ['node', 'node-addons']
    }
  }
}; 