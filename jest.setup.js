/**
 * Jest setup file for ES modules and testing environment
 */

import { MongoMemoryServer } from 'mongodb-memory-server';

// Global test configuration
global.console = {
  ...console,
  // Uncomment to hide logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Global MongoDB memory server
let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.NODE_ENV = 'test';
});

afterAll(async () => {
  if (mongod) {
    await mongod.stop();
  }
});
